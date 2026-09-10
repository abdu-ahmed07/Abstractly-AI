import { useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRegisterUser } from '@workspace/api-client-react';

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

const topicAllowedCharacters = /^[\p{L}\p{N}\s&+.,:;/'()\-#]+$/u;
const topicPromptInjection = [
  /\bignore(?:\s+(?:all|any|the))?\s+(?:(?:previous|prior|above|earlier)\s+)?instructions?\b/i,
  /\b(?:disregard|override|forget|bypass)\b.{0,40}\b(?:instructions?|rules?|prompt|system\s+message)\b/i,
  /\b(?:system|developer)\s+(?:prompt|message|instructions?)\b/i,
  /\bdo\s+not\s+follow\b/i,
];

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  topic: z
    .string()
    .trim()
    .min(1, 'Research topic is required.')
    .max(200, 'Topic must be under 200 characters.')
    .refine(
      (value) => !topicPromptInjection.some((pattern) => pattern.test(value)),
      'Enter a research subject only; instruction-like text is not allowed.',
    )
    .refine(
      (value) => [...value].every((character) => topicAllowedCharacters.test(character)),
      'Use words, numbers, spaces, and common research punctuation only.',
    ),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export function Signup() {
  const registerUser = useRegisterUser();
  const [, navigate] = useLocation();

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      topic: '',
    },
  });

  const onSubmit = (values: SignupFormValues) => {
    registerUser.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          navigate(
            `/feed?email=${encodeURIComponent(data.email)}&topic=${encodeURIComponent(data.topic)}`,
          );
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center px-6 py-16 md:px-12">
      <div className="w-full max-w-2xl">
        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-serif font-medium mb-6 text-foreground">
            Set up your feed
          </h1>
          <p className="text-lg text-foreground/80 max-w-[65ch] leading-relaxed">
            Tell us what you are researching. We will send you a focused, machine-ranked list of relevant academic papers.
          </p>
        </header>

        <main className="max-w-md w-full">
          <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
                data-testid="signup-form"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium">Email address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@university.edu"
                          type="email"
                          autoComplete="email"
                          className="rounded-none border-border bg-transparent focus-visible:ring-primary h-12 text-base"
                          data-testid="input-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage data-testid="error-email" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="topic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium">Research topic</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. quantum error correction in topological codes"
                          className="rounded-none border-border bg-transparent focus-visible:ring-primary h-12 text-base"
                          data-testid="input-topic"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-sm text-muted-foreground mt-2">
                        Be specific. The more detailed your topic, the better we can rank your feed.
                      </p>
                      <FormMessage data-testid="error-topic" />
                    </FormItem>
                  )}
                />

                {registerUser.isError && (
                  <div
                    className="p-4 text-base border-l-2 border-destructive text-destructive bg-transparent"
                    data-testid="error-api"
                  >
                    {registerUser.error?.data?.error ||
                      'Registration failed. Please try again.'}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-14 text-base rounded-none bg-primary hover:bg-primary/90 text-primary-foreground mt-4"
                  disabled={registerUser.isPending}
                  data-testid="button-submit"
                >
                  {registerUser.isPending ? 'Starting...' : 'Start Tracking'}
                </Button>
              </form>
          </Form>
        </main>
      </div>
    </div>
  );
}
