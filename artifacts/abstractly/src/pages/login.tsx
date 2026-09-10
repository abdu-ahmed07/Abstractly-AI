import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLoginUser } from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function Login() {
  const [, navigate] = useLocation();
  const [notFound, setNotFound] = useState(false);
  const loginUser = useLoginUser();
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = (values: LoginFormValues) => {
    setNotFound(false);
    loginUser.mutate(
      { data: values },
      {
        onSuccess: (user) => {
          navigate(
            `/feed?email=${encodeURIComponent(user.email)}&topic=${encodeURIComponent(user.topic)}`,
          );
        },
        onError: (error) => {
          if (error.status === 404) {
            setNotFound(true);
          }
        },
      },
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center px-6 py-16 md:px-12">
      <div className="w-full max-w-2xl">
        <header className="mb-12">
          <Link
            href="/"
            className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
          >
            ← Back to welcome
          </Link>
          <h1 className="mb-6 font-serif text-4xl md:text-5xl font-medium text-foreground">
            Return to your feed
          </h1>
          <p className="max-w-[65ch] text-lg leading-relaxed text-foreground/80">
            Enter the email you used to subscribe.
          </p>
        </header>

        <main className="w-full max-w-md">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-8"
              data-testid="login-form"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">Email address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@university.edu"
                        className="rounded-none border-border bg-transparent focus-visible:ring-primary h-12 text-base"
                        data-testid="input-login-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {notFound && (
                <div
                  className="p-4 text-base border-l-2 border-foreground bg-transparent"
                  data-testid="login-not-found"
                >
                  <p>No account found with that email.</p>
                  <Link
                    href="/signup"
                    className="mt-2 inline-block font-medium underline underline-offset-4 text-primary"
                  >
                    Start tracking a new topic
                  </Link>
                </div>
              )}

              {loginUser.isError && !notFound && (
                <div className="p-4 text-base border-l-2 border-destructive text-destructive bg-transparent">
                  {loginUser.error.data?.error ||
                    'Unable to look up your account. Please try again.'}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-14 text-base rounded-none bg-primary hover:bg-primary/90 text-primary-foreground mt-4"
                disabled={loginUser.isPending}
                data-testid="button-login-submit"
              >
                {loginUser.isPending ? 'Finding...' : 'Find My Feed'}
              </Button>
            </form>
          </Form>
        </main>
      </div>
    </div>
  );
}
