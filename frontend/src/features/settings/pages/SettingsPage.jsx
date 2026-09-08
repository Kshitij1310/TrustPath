import { useState } from 'react';
import { Monitor, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { useCurrentUser } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useDeleteAccount, useMe, useUpdateSettings } from '@/features/auth/queries';
import { cn } from '@/lib/utils';

const PRIVACY_TOGGLES = [
  {
    key: 'shareLiveLocation',
    label: 'Allow live location sharing',
    description: 'Lets you generate share links for individual journeys. Each link still has to be created and sent by you.',
  },
  {
    key: 'notifyContactsOnOverdue',
    label: 'Prompt me to contact someone when overdue',
    description: 'If a journey passes its ETA without a check-in, TrustRoute asks whether you are safe and offers to reach your contacts.',
  },
  {
    key: 'voiceSafetyEnabled',
    label: 'Voice safety',
    description: 'Listens for a trigger word while a journey is active. The microphone is never opened without this switch on.',
  },
];

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function SettingsPage() {
  const user = useCurrentUser();
  const { isLoading } = useMe();
  const updateSettings = useUpdateSettings();
  const deleteAccount = useDeleteAccount();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [retentionDays, setRetentionDays] = useState(
    user?.settings?.journeyHistoryRetentionDays ?? 30,
  );

  const settings = user?.settings ?? {};

  return (
    <div className="container max-w-2xl space-y-6 py-6">
      <PageHeader
        title="Settings & privacy"
        description="Your location, journeys and contacts are private by default. Nothing here is on unless you turn it on."
      />

      {/* Privacy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy</CardTitle>
          <CardDescription>Controls for the data TrustRoute treats as sensitive.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {PRIVACY_TOGGLES.map((toggle, idx) => (
            <div key={toggle.key}>
              {idx > 0 && <Separator className="my-3" />}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor={toggle.key}>{toggle.label}</Label>
                  <p className="text-xs text-muted-foreground">{toggle.description}</p>
                </div>
                <Switch
                  id={toggle.key}
                  checked={Boolean(settings[toggle.key])}
                  disabled={isLoading || updateSettings.isPending}
                  onCheckedChange={(checked) => updateSettings.mutate({ [toggle.key]: checked })}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Retention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journey history</CardTitle>
          <CardDescription>How long completed journeys and their locations are kept.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="retention">Retention (days)</Label>
            <Input
              id="retention"
              type="number"
              min={1}
              max={365}
              value={retentionDays}
              onChange={(event) => setRetentionDays(event.target.value)}
              className="w-32"
            />
          </div>
          <Button
            variant="outline"
            loading={updateSettings.isPending}
            onClick={() =>
              updateSettings.mutate({ journeyHistoryRetentionDays: Number(retentionDays) })
            }
          >
            Save
          </Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors',
                  theme === value ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-accent/40',
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base">Delete account</CardTitle>
          <CardDescription>
            Removes your account and everything attached to it — journeys, locations, trusted
            contacts and SOS records. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 />
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Alert variant="info">
        <ShieldCheck />
        <AlertTitle>What TrustRoute does not do</AlertTitle>
        <AlertDescription>
          It does not track you when no journey is running, does not share your location with anyone
          you have not explicitly sent a link to, and does not send messages on your behalf.
        </AlertDescription>
      </Alert>

      <Dialog open={isDeleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Type <span className="font-mono font-semibold">DELETE</span> to confirm. Everything is
              removed immediately and cannot be recovered.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm"
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== 'DELETE'}
              loading={deleteAccount.isPending}
              onClick={() => deleteAccount.mutate()}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
