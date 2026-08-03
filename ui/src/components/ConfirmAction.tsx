import { useState } from 'react';

/**
 * A destructive action behind one inline confirmation step — no modal, no
 * browser dialog. First click swaps the button for "<question> yes / no", so
 * nothing irreversible happens on a stray click.
 */
export default function ConfirmAction({
  label,
  question,
  onConfirm,
  pending,
  pendingLabel = 'working…',
  className = '',
  title,
}: {
  label: string;
  question: string;
  onConfirm: () => void;
  pending?: boolean;
  pendingLabel?: string;
  className?: string;
  title?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (pending) return <span className="text-xs lowercase text-muted">{pendingLabel}</span>;

  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title={title}
        className={`text-xs lowercase text-faint underline decoration-line underline-offset-2 hover:text-danger hover:decoration-danger ${className}`}
      >
        {label}
      </button>
    );

  return (
    <span className="inline-flex items-center gap-1.5 text-xs lowercase text-muted">
      {question}
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
        className="text-danger hover:underline"
      >
        yes
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="hover:text-ink">
        no
      </button>
    </span>
  );
}
