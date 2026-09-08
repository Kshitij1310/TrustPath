import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Crosshair, ImagePlus, MapPin, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGeolocation } from '@/hooks/useGeolocation';
import { REPORT_CATEGORIES } from '@/lib/risk';
import { formatCoords } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCreateReport } from '../queries';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const schema = z.object({
  category: z.enum(REPORT_CATEGORIES.map((c) => c.value)),
  severity: z.coerce.number().int().min(1).max(5),
  description: z.string().max(1000).optional(),
});

const SEVERITY_LABELS = {
  1: 'Minor',
  2: 'Noticeable',
  3: 'Concerning',
  4: 'Serious',
  5: 'Severe',
};

/**
 * Submit a community report at a chosen point.
 *
 * `coords` may be supplied by the caller (a map click) or resolved from the
 * device. A report cannot be submitted without a location — a report with no
 * place is noise in the risk engine.
 */
export function ReportDialog({ open, onOpenChange, coords: initialCoords }) {
  const [coords, setCoords] = useState(initialCoords ?? null);
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState(null);
  const createReport = useCreateReport();
  const { coords: deviceCoords, isLoading: isLocating, refresh } = useGeolocation({ enabled: false });

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { category: 'unsafe_area', severity: 2, description: '' },
  });

  useEffect(() => {
    if (open) setCoords(initialCoords ?? null);
  }, [open, initialCoords]);

  useEffect(() => {
    if (deviceCoords && !coords) setCoords(deviceCoords);
  }, [deviceCoords, coords]);

  const pickImage = (event) => {
    const file = event.target.files?.[0];
    setImageError(null);
    if (!file) return setImage(null);

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Image must be 5 MB or smaller.');
      return setImage(null);
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Use a JPEG, PNG or WebP image.');
      return setImage(null);
    }
    return setImage(file);
  };

  const onSubmit = (values) => {
    if (!coords) return;
    createReport.mutate(
      { ...values, lat: coords[0], lng: coords[1], image },
      {
        onSuccess: () => {
          reset();
          setImage(null);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report a safety issue</DialogTitle>
          <DialogDescription>
            Reports feed the risk engine for everyone nearby. Be specific about what you saw.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Location */}
          <div className="space-y-1.5">
            <Label>Location</Label>
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border p-3 text-sm',
                !coords && 'border-destructive/50',
              )}
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className={cn('flex-1 truncate', !coords && 'text-muted-foreground')}>
                {coords ? formatCoords(coords) : 'No location selected'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={refresh}
                loading={isLocating}
              >
                <Crosshair />
                Use mine
              </Button>
            </div>
            {!coords && (
              <p className="text-xs text-muted-foreground">
                Tap the map or use your current location.
              </p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="category">What happened?</Label>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Severity */}
          <div className="space-y-1.5">
            <Label htmlFor="severity">How serious?</Label>
            <Controller
              control={control}
              name="severity"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                  <SelectTrigger id="severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {value} — {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              placeholder="e.g. Street lights have been out for a week along this stretch."
              aria-invalid={Boolean(errors.description)}
              {...register('description')}
            />
          </div>

          {/* Photo */}
          <div className="space-y-1.5">
            <Label htmlFor="image">Photo (optional)</Label>
            {image ? (
              <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <img
                  src={URL.createObjectURL(image)}
                  alt=""
                  className="size-10 rounded object-cover"
                />
                <span className="flex-1 truncate">{image.name}</span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setImage(null)}>
                  <X />
                </Button>
              </div>
            ) : (
              <label
                htmlFor="image"
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
              >
                <ImagePlus className="size-4" />
                Add a photo — JPEG, PNG or WebP, up to 5 MB
              </label>
            )}
            <input
              id="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={pickImage}
            />
            {imageError && <p className="text-xs font-medium text-destructive">{imageError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createReport.isPending} disabled={!coords}>
              Submit report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
