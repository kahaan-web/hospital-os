'use client';

import { useEffect, useState } from 'react';
import { otSchedulingApi, type OtDoctorDto, type OtResourceDto, type OtSpecialRemarkDto } from './api';

export function useOtLookups() {
  const [resources, setResources] = useState<OtResourceDto[]>([]);
  const [surgeons, setSurgeons] = useState<OtDoctorDto[]>([]);
  const [anaesthetists, setAnaesthetists] = useState<OtDoctorDto[]>([]);
  const [remarks, setRemarks] = useState<OtSpecialRemarkDto[]>([]);
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const failed: string[] = [];
    const load = async <T,>(label: string, fn: () => Promise<T[]>): Promise<T[]> => {
      try {
        return await fn();
      } catch {
        failed.push(label);
        return [];
      }
    };
    Promise.all([
      load('theatres', () => otSchedulingApi.resources()),
      load('surgeons', () => otSchedulingApi.doctors('surgeon')),
      load('anaesthetists', () => otSchedulingApi.doctors('anaesthetist')),
      load('special remarks', () => otSchedulingApi.specialRemarks()),
    ])
      .then(([nextResources, nextSurgeons, nextAnaesthetists, nextRemarks]) => {
        if (cancelled) return;
        setResources(nextResources);
        setSurgeons(nextSurgeons);
        setAnaesthetists(nextAnaesthetists);
        setRemarks(nextRemarks);
        setWarning(failed.length > 0 ? `Could not load ${failed.join(', ')}.` : '');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { resources, surgeons, anaesthetists, remarks, warning, loading };
}
