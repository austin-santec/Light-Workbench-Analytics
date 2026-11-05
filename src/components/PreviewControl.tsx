import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

const description = 'Preview — unavailable in this frontend milestone';

export function PreviewButton({ className = '', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'onClick'>) {
  return <button type="button" {...props} className={`preview-control ${className}`} disabled title={description} aria-describedby="preview-help" />;
}

export function PreviewSelect({ className = '', ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'disabled' | 'onChange'>) {
  return <select {...props} className={`preview-control ${className}`} disabled title={description} aria-describedby="preview-help" />;
}

export function PreviewInput({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'disabled' | 'onChange'>) {
  return <input {...props} className={`preview-control ${className}`} disabled title={description} aria-describedby="preview-help" />;
}
