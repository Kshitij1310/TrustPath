import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Label + input + error, wired for accessibility: the error is announced and
 * linked to the field via aria-describedby, not just coloured red.
 *
 * Must forward its ref. Callers spread `{...register('field')}` onto this
 * component, and that object carries a `ref` — React consumes `ref` on a plain
 * function component instead of passing it through in props, so react-hook-form
 * would never see the input and every field would read as empty.
 */
export const FormField = forwardRef(
  ({ id, label, error, hint, className, inputClassName, ...inputProps }, ref) => {
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    return (
      <div className={cn('space-y-1.5', className)}>
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          ref={ref}
          aria-invalid={Boolean(error)}
          aria-describedby={cn(error && errorId, hint && hintId) || undefined}
          className={inputClassName}
          {...inputProps}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  },
);
FormField.displayName = 'FormField';
