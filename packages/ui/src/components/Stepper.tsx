import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface StepperStep {
  id: string;
  label: string;
  /** Overrides the default spoken step name (label is still shown visually). */
  ariaLabel?: string;
  description?: ReactNode;
}

export interface StepperProps {
  steps: StepperStep[];
  currentStepId: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  onStepClick?: (stepId: string, index: number) => void;
}

function stepStatus(index: number, currentIndex: number): 'complete' | 'current' | 'upcoming' {
  if (index < currentIndex) return 'complete';
  if (index === currentIndex) return 'current';
  return 'upcoming';
}

export function Stepper({
  steps,
  currentStepId,
  orientation = 'horizontal',
  className,
  onStepClick,
}: StepperProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  return (
    <nav
      className={cn('hos-stepper', `hos-stepper--${orientation}`, className)}
      aria-label="Progress"
    >
      <ol
        style={{
          display: 'flex',
          flexDirection: orientation === 'vertical' ? 'column' : 'row',
          listStyle: 'none',
          margin: 0,
          padding: 0,
          width: '100%',
          gap: orientation === 'horizontal' ? undefined : 'var(--hos-space-2)',
        }}
      >
        {steps.map((step, index) => {
          const status = stepStatus(index, currentIndex);
          const isComplete = status === 'complete';
          const isCurrent = status === 'current';
          const clickable = onStepClick && (isComplete || isCurrent);
          const spoken =
            step.ariaLabel ??
            `${step.label}, step ${index + 1} of ${steps.length}, ${status === 'complete' ? 'completed' : status === 'current' ? 'current' : 'upcoming'}`;

          return (
            <li
              key={step.id}
              className={cn('hos-stepper__item', `hos-stepper__item--${status}`)}
              style={{
                display: 'flex',
                flex: orientation === 'horizontal' ? 1 : undefined,
                flexDirection: orientation === 'horizontal' ? 'column' : 'row',
                alignItems: orientation === 'horizontal' ? 'center' : 'flex-start',
                textAlign: orientation === 'horizontal' ? 'center' : 'left',
              }}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {index > 0 && orientation === 'horizontal' ? (
                <div
                  className={cn(
                    'hos-stepper__connector',
                    index <= currentIndex && 'hos-stepper__connector--done',
                  )}
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                className="hos-stepper__indicator hos-stepper__indicator-btn hos-focus-visible"
                disabled={!clickable}
                onClick={() => onStepClick?.(step.id, index)}
                aria-label={spoken}
              >
                {isComplete ? <Check size={14} aria-hidden strokeWidth={1.5} /> : index + 1}
              </button>
              <div style={{ minWidth: 0 }}>
                <p className="hos-stepper__label">{step.label}</p>
                {step.description ? (
                  <p className="hos-stepper__desc">{step.description}</p>
                ) : null}
              </div>
              {orientation === 'vertical' && index < steps.length - 1 ? (
                <div
                  className={cn(
                    'hos-stepper__connector',
                    index < currentIndex && 'hos-stepper__connector--done',
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
