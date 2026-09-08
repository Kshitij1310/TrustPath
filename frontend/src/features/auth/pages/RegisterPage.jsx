import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { paths } from '@/app/routes';
import { AuthLayout } from '../components/AuthLayout';
import { FormField } from '../components/FormField';
import { useRegister } from '../queries';

// Mirrors the server's rules so the user is told before the round trip.
const schema = z.object({
  displayName: z.string().min(1, 'Tell us what to call you').max(100),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  phone: z
    .string()
    .regex(/^\+?[\d\s-]{6,20}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  password: z.string().min(8, 'Use at least 8 characters'),
});

export default function RegisterPage() {
  const navigate = useNavigate();
  const registerUser = useRegister();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', phone: '', password: '' },
  });

  const onSubmit = (values) =>
    registerUser.mutate(
      { ...values, phone: values.phone || undefined },
      {
        onSuccess: () => navigate(paths.emergency, { replace: true }),
        onError: (error) => {
          // Surface server-side field errors (e.g. duplicate email) inline.
          Object.entries(error.fieldErrors ?? {}).forEach(([field, message]) =>
            setError(field, { message }),
          );
        },
      },
    );

  return (
    <AuthLayout
      title="Create your account"
      description="Takes a minute. Your location and contacts stay private to you."
      footer={
        <>
          Already have an account?{' '}
          <Link to={paths.login} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {registerUser.isError && !Object.keys(registerUser.error.fieldErrors ?? {}).length && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{registerUser.error.message}</AlertDescription>
          </Alert>
        )}

        <FormField
          id="displayName"
          label="Name"
          autoComplete="name"
          placeholder="Your name"
          error={errors.displayName?.message}
          {...register('displayName')}
        />

        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <FormField
          id="phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          hint="Optional. Shown to your trusted contacts during an SOS."
          error={errors.phone?.message}
          {...register('phone')}
        />

        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" className="w-full" loading={registerUser.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
