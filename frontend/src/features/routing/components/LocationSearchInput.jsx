import { useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { useGeocode } from '../queries';

/**
 * Address autocomplete with an optional "use my location" action.
 *
 * `value` is the selected place ({ label, lat, lng }) — the text box is
 * uncontrolled scratch space until a suggestion is picked, so a half-typed
 * query can never be mistaken for a real location.
 */
export function LocationSearchInput({
  id,
  placeholder,
  value,
  onChange,
  onUseMyLocation,
  isLocating = false,
  icon: Icon = MapPin,
  className,
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const debouncedQuery = useDebouncedValue(query, 400);
  const { data: results = [], isFetching } = useGeocode(isOpen ? debouncedQuery : '');

  // Reflect an externally set place (e.g. "my location") in the text box.
  useEffect(() => {
    if (value?.label) setQuery(value.label);
    if (!value) setQuery('');
  }, [value]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const select = (result) => {
    onChange({ label: result.label, lat: result.lat, lng: result.lng, state: result.state, district: result.district });
    setQuery(result.label);
    setIsOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

      <Input
        id={id}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        className="pl-9 pr-20"
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          // Typing over a chosen place invalidates it.
          if (value) onChange(null);
        }}
        onFocus={() => setIsOpen(true)}
      />

      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {query && (
          <Button type="button" variant="ghost" size="icon-sm" onClick={clear} aria-label="Clear">
            <X />
          </Button>
        )}
        {onUseMyLocation && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onUseMyLocation}
            loading={isLocating}
            aria-label="Use my current location"
            title="Use my current location"
          >
            <Crosshair />
          </Button>
        )}
      </div>

      {isOpen && debouncedQuery.trim().length >= 3 && (
        <div className="absolute z-[1000] mt-1.5 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
          {results.length === 0 && !isFetching ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No matching places.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {results.map((result, idx) => (
                <li key={`${result.lat}-${result.lng}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => select(result)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="line-clamp-2">{result.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
