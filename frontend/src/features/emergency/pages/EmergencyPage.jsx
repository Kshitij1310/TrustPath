import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Phone, Plus, Siren, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState, ListSkeleton } from '@/components/common/states';
import { PageHeader } from '@/components/common/PageHeader';
import { FormField } from '@/features/auth/components/FormField';
import { formatDateTime } from '@/lib/format';
import { FakeCall } from '../components/FakeCall';
import { useAddContact, useContacts, useDeleteContact, useSosHistory } from '../queries';

/** Numbers that work with no setup at all. */
const PUBLIC_SERVICES = [
  { name: 'Emergency', phone: '112', note: 'Police, fire and ambulance' },
  { name: 'Women Helpline', phone: '1091', note: 'Available 24×7' },
  { name: 'Ambulance', phone: '108', note: 'Medical emergencies' },
  { name: 'Police', phone: '100', note: 'Control room' },
];

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  phone: z.string().regex(/^\+?[\d\s-]{6,20}$/, 'Enter a valid phone number'),
  relation: z.string().max(50).optional(),
  priority: z.coerce.number().int().min(1).max(10),
});

export default function EmergencyPage() {
  const [isDialogOpen, setDialogOpen] = useState(false);
  const { data: contacts, isLoading } = useContacts();
  const { data: sosHistory } = useSosHistory();
  const deleteContact = useDeleteContact();

  return (
    <div className="container max-w-4xl space-y-6 py-6">
      <PageHeader
        title="Emergency"
        description="Who to reach, and the tools to get out of a situation."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <UserPlus />
            Add contact
          </Button>
        }
      />

      <Alert variant="info">
        <Siren />
        <AlertDescription>
          TrustRoute never sends messages for you. When you trigger an SOS it prepares the message
          and the links — your phone does the sending, so you always know what went out.
        </AlertDescription>
      </Alert>

      {/* Public services */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Emergency services</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {PUBLIC_SERVICES.map((service) => (
            <a
              key={service.phone}
              href={`tel:${service.phone}`}
              className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-accent/40"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                <Phone className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  {service.name} · {service.phone}
                </p>
                <p className="text-xs text-muted-foreground">{service.note}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Trusted contacts */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your trusted contacts</h2>

        {isLoading ? (
          <ListSkeleton rows={2} />
        ) : contacts?.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No trusted contacts yet"
            description="Add someone who should hear from you in an emergency. They appear first in the SOS sheet, ready to call or text."
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus />
                Add your first contact
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-center gap-3 rounded-xl border p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {contact.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{contact.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {contact.phone}
                    {contact.relation ? ` · ${contact.relation}` : ''}
                  </p>
                </div>
                <Badge variant="secondary">Priority {contact.priority}</Badge>
                <Button variant="ghost" size="icon" asChild aria-label={`Call ${contact.name}`}>
                  <a href={`tel:${contact.phone}`}>
                    <Phone />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteContact.mutate(contact.id)}
                  aria-label={`Remove ${contact.name}`}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FakeCall />

      {/* SOS history */}
      {sosHistory?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SOS history</CardTitle>
            <CardDescription>Every SOS you have triggered, and how it ended.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {sosHistory.map((incident) => (
                <li key={incident.id} className="flex items-center gap-3 text-sm">
                  <Badge
                    variant={incident.status === 'open' ? 'destructive' : 'secondary'}
                    className="capitalize"
                  >
                    {incident.status.replace('_', ' ')}
                  </Badge>
                  <span className="capitalize text-muted-foreground">{incident.trigger}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDateTime(incident.created_at ?? incident.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AddContactDialog open={isDialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function AddContactDialog({ open, onOpenChange }) {
  const addContact = useAddContact();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', phone: '', relation: '', priority: 1 },
  });

  const onSubmit = (values) =>
    addContact.mutate(
      { ...values, relation: values.relation || undefined },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a trusted contact</DialogTitle>
          <DialogDescription>
            They will be listed in your SOS sheet with one-tap call and message actions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField id="name" label="Name" error={errors.name?.message} {...register('name')} />
          <FormField
            id="phone"
            label="Phone"
            type="tel"
            placeholder="+91 98765 43210"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <FormField
            id="relation"
            label="Relationship"
            placeholder="Sister, flatmate, friend…"
            error={errors.relation?.message}
            {...register('relation')}
          />
          <FormField
            id="priority"
            label="Priority"
            type="number"
            min={1}
            max={10}
            hint="1 is contacted first."
            error={errors.priority?.message}
            {...register('priority')}
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={addContact.isPending}>
              Add contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
