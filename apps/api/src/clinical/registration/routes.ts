import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { schema } from '@hos/db';
import {
  mlcCaseSchema,
  patientCreateSchema,
  patientDocumentKindSchema,
  patientMailerSchema,
  patientUpdateSchema,
  registerReportQuery,
} from '@hos/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, TenantGate } from '../../guard';
import { openTenant } from '../../guard';
import { ApiError, sendCommittedDownload, type CommittedDownload } from '../../http';
import { letterhead, renderHtml, renderPdf } from '../print';
import { readPatient } from '../patients-read';
import { barcodeDoc, casePaperDoc, photoIdDoc, stickerDoc } from './prints';
import {
  addDocument,
  createMlc,
  createPatient,
  deleteDocument,
  docFileName,
  ensureUploadDir,
  listDocuments,
  listMlc,
  registerReport,
  registerReportCsv,
  registrationFeatures,
  savePatientPhoto,
  sendMailer,
  updatePatient,
} from './service';
import { detectPatientFile } from './uploads';

const MODULE = 'patient-registration';
const PREFIX = `/api/v1/tenant/m/${MODULE}`;

const printKinds = ['case-paper', 'sticker', 'photo-id', 'barcode'] as const;
const printFormats = ['pdf', 'html'] as const;

function ctx(gate: TenantGate) {
  if (!gate.locationId || !gate.actor.tenantId) throw new ApiError(422, 'location_required', 'Choose a location');
  return {
    tx: gate.tx,
    tenantId: gate.actor.tenantId,
    locationId: gate.locationId,
    userId: gate.user.id,
    audit: gate.audit,
  };
}

async function guardRegistration(gate: TenantGate): Promise<void> {
  await gate.requireModule(MODULE);
}

export function registerRegistration(app: FastifyInstance, deps: Deps): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const run = <T>(req: FastifyRequest, reply: FastifyReply, fn: (gate: TenantGate) => Promise<T>) => openTenant(deps, req, reply, fn);

  r.post(`${PREFIX}/patients`, { schema: { body: patientCreateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.newRegistration);
      gate.requirePermission('patients.manage');
      const created = await createPatient({ ...ctx(gate), audit: gate.audit }, req.body);
      reply.code(201);
      return created;
    }),
  );

  r.patch(`${PREFIX}/patients/:id`, { schema: { params: z.object({ id: z.uuid() }), body: patientUpdateSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.editRegistration);
      gate.requirePermission('patients.manage');
      return updatePatient({ ...ctx(gate), audit: gate.audit }, req.params.id, req.body);
    }),
  );

  r.post(`${PREFIX}/patients/:id/photo`, { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      gate.requirePermission('patients.manage');
      await readPatient(gate.tx, req.params.id);
      const file = await req.file({ limits: { fileSize: 1_048_576 } });
      if (!file) throw new ApiError(400, 'validation', 'Choose a photo up to 1 MB');
      const bytes = await file.toBuffer();
      const { ext, mime } = detectPatientFile(bytes);
      if (ext === 'pdf') throw new ApiError(400, 'validation', 'Use a JPG or PNG for the photo');
      const relative = join('patients', gate.actor.tenantId!, req.params.id, `photo.${ext}`);
      const dir = await ensureUploadDir(deps.env.uploadDir, ['patients', gate.actor.tenantId!, req.params.id]);
      const abs = join(deps.env.uploadDir, relative);
      try {
        await writeFile(abs, bytes);
        const patient = await savePatientPhoto({ ...ctx(gate), audit: gate.audit }, req.params.id, relative);
        return { patient, mime };
      } catch (error) {
        await rm(abs, { force: true });
        await rm(dir, { recursive: false }).catch(() => undefined);
        throw error;
      }
    }),
  );

  r.get(`${PREFIX}/patients/:id/documents`, { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.attachPatientDocuments);
      gate.requireAnyPermission(['patients.view', 'patients.manage']);
      return listDocuments(gate.tx, req.params.id);
    }),
  );

  r.post(`${PREFIX}/patients/:id/documents`, { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.attachPatientDocuments);
      gate.requirePermission('patients.manage');
      const parts = req.parts();
      let kind = 'Document';
      let fileBuffer: Buffer | null = null;
      let mime = 'application/octet-stream';
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'file') {
          fileBuffer = await part.toBuffer();
          const detected = detectPatientFile(fileBuffer);
          mime = detected.mime;
        } else if (part.type === 'field' && part.fieldname === 'kind') {
          const parsed = patientDocumentKindSchema.safeParse({ kind: String(part.value) });
          if (parsed.success) kind = parsed.data.kind;
        }
      }
      if (!fileBuffer) throw new ApiError(400, 'validation', 'Attach a PDF, JPG or PNG up to 5 MB');
      const detected = detectPatientFile(fileBuffer);
      // Reject an unknown patient before mkdir/write so a bad id leaves no file on disk.
      await readPatient(gate.tx, req.params.id);
      const name = `${docFileName()}.${detected.ext}`;
      const relative = join('patients', gate.actor.tenantId!, req.params.id, 'docs', name);
      await ensureUploadDir(deps.env.uploadDir, ['patients', gate.actor.tenantId!, req.params.id, 'docs']);
      await writeFile(join(deps.env.uploadDir, relative), fileBuffer);
      const doc = await addDocument({ ...ctx(gate), audit: gate.audit }, req.params.id, kind, relative, mime, fileBuffer.length);
      reply.code(201);
      return doc;
    }),
  );

  r.delete(`${PREFIX}/patients/:id/documents/:docId`, { schema: { params: z.object({ id: z.uuid(), docId: z.uuid() }) } }, async (req, reply) => {
    await run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.attachPatientDocuments);
      gate.requirePermission('patients.manage');
      await deleteDocument({ ...ctx(gate), audit: gate.audit }, req.params.id, req.params.docId);
      reply.code(204);
      return null;
    });
  });

  r.get(
    `${PREFIX}/patients/:id/print/:kind/:format`,
    { schema: { params: z.object({ id: z.uuid(), kind: z.enum(printKinds), format: z.enum(printFormats) }) } },
    async (req, reply) => {
      const file = await run(req, reply, async (gate): Promise<CommittedDownload> => {
        await guardRegistration(gate);
        gate.requireAnyPermission(['patients.view', 'patients.manage']);
        const { kind, format } = req.params;
        const featureMap = {
          'case-paper': registrationFeatures.printCasePaper,
          sticker: registrationFeatures.printStickers,
          'photo-id': registrationFeatures.printPatientPhotoId,
          barcode: registrationFeatures.printBarcode,
        } as const;
        await gate.requireFeature(featureMap[kind]);
        const patient = await readPatient(gate.tx, req.params.id);
        const head = await letterhead(gate.tx, gate.locationId!);
        const doc =
          kind === 'case-paper' ? casePaperDoc(patient, head)
          : kind === 'sticker' ? stickerDoc(patient, head)
          : kind === 'photo-id' ? photoIdDoc(patient, head)
          : barcodeDoc(patient, head);
        if (format === 'html') return { download: 'html', html: renderHtml(doc) };
        const pdf = await renderPdf(doc);
        return { download: 'pdf', bytes: Buffer.from(pdf), filename: `${kind}-${patient.uhid}.pdf` };
      });
      return sendCommittedDownload(reply, file);
    },
  );

  r.get(`${PREFIX}/reports/register`, { schema: { querystring: registerReportQuery } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.printRegister);
      gate.requirePermission('reports.view');
      const rows = await registerReport(gate.tx, req.query);
      return { items: rows };
    }),
  );

  r.get(`${PREFIX}/reports/register.csv`, { schema: { querystring: registerReportQuery } }, async (req, reply) => {
    const file = await run(req, reply, async (gate): Promise<CommittedDownload> => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.patientExcelData);
      gate.requirePermission('reports.view');
      const rows = await registerReport(gate.tx, req.query);
      return { download: 'csv', csv: registerReportCsv(rows), filename: 'patient-register.csv' };
    });
    return sendCommittedDownload(reply, file);
  });

  r.post(`${PREFIX}/patients/:id/mailer`, { schema: { params: z.object({ id: z.uuid() }), body: patientMailerSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.sendMailers);
      gate.requirePermission('patients.manage');
      return sendMailer({ ...ctx(gate), audit: gate.audit }, req.params.id, req.body, deps.email, deps.sms);
    }),
  );

  r.get(`${PREFIX}/mlc`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.mlcCaseRegister);
      gate.requirePermission('patients.manage');
      return listMlc(gate.tx);
    }),
  );

  r.post(`${PREFIX}/mlc`, { schema: { body: mlcCaseSchema } }, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.mlcRegistration);
      gate.requirePermission('patients.manage');
      const created = await createMlc({ ...ctx(gate), audit: gate.audit }, req.body);
      reply.code(201);
      return created;
    }),
  );

  r.get(`${PREFIX}/reports/mlc`, async (req, reply) =>
    run(req, reply, async (gate) => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.mlcCaseRegister);
      gate.requirePermission('reports.view');
      return listMlc(gate.tx);
    }),
  );

  r.get(`${PREFIX}/patients/:id/documents/:docId/file`, { schema: { params: z.object({ id: z.uuid(), docId: z.uuid() }) } }, async (req, reply) => {
    const file = await run(req, reply, async (gate): Promise<CommittedDownload> => {
      await guardRegistration(gate);
      await gate.requireFeature(registrationFeatures.attachPatientDocuments);
      gate.requireAnyPermission(['patients.view', 'patients.manage']);
      const [row] = await gate.tx
        .select()
        .from(schema.patientDocuments)
        .where(and(eq(schema.patientDocuments.patientId, req.params.id), eq(schema.patientDocuments.id, req.params.docId)));
      if (!row) throw new ApiError(404, 'not_found', 'Document not found');
      const abs = join(deps.env.uploadDir, row.filePath);
      const bytes = await readFile(abs);
      return { download: 'file', bytes, mime: row.mime, filename: row.kind };
    });
    return sendCommittedDownload(reply, file);
  });
}
