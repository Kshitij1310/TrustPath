import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

/**
 * `indicatorClassName` lets a caller colour the bar by risk band without
 * reaching past the component's API.
 */
const Progress = React.forwardRef(
  ({ className, value = 0, indicatorClassName, indicatorStyle, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn('h-full w-full flex-1 rounded-full bg-primary transition-transform duration-500', indicatorClassName)}
      style={{ transform: `translateX(-${100 - (value || 0)}%)`, ...indicatorStyle }}
    />
  </ProgressPrimitive.Root>
  ),
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
