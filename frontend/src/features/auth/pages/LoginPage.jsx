import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { paths } from '@/app/routes';
import { AuthLayout } from '../components/AuthLayout';
import { FormField } from '../components/FormField';
import { useLogin } from '../queries';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = (values) =>
    login.mutate(values, {
      // Return the user to whatever they were trying to open.
      onSuccess: () => navigate(location.state?.from?.pathname ?? paths.plan, { replace: true }),
    });

  return (
    <AuthLayout
      title="Sign in"
      description="Pick up your journeys, contacts and saved routes."
      footer={
        <>
          New here?{' '}
          <Link to={paths.register} className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {login.isError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{login.error.message}</AlertDescription>
          </Alert>
        )}

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
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
