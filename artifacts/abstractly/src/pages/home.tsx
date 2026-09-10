import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  getGetFeedSettingsQueryKey,
  getListScoredPapersQueryKey,
  useGetFeedSettings,
  useListScoredPapers,
  useSavePaperFeedback,
  useSetReadLater,
  useUpdateFeedSettings,
  type ScoredPaper,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Bookmark, ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const THRESHOLD_OPTIONS = [50, 70, 90] as const;
type RelevanceThreshold = (typeof THRESHOLD_OPTIONS)[number];
type FeedView = 'all' | 'read_later';

export function Home() {
  const [, navigate] = useLocation();
  const email =
    new URLSearchParams(window.location.search).get('email')?.trim().toLowerCase() ?? '';
  const topic =
    new URLSearchParams(window.location.search).get('topic')?.trim() || 'your topic';
  const [activeView, setActiveView] = useState<FeedView>('all');
  const settingsParams = { email };
  const papersParams = { email, view: activeView };
  const { data: settings, isLoading: isSettingsLoading, isError: isSettingsError, error: settingsError } =
    useGetFeedSettings(settingsParams, {
      query: {
        queryKey: getGetFeedSettingsQueryKey(settingsParams),
        enabled: Boolean(email),
        retry: false,
      },
    });
  const { data: papers, isLoading, isError, error } = useListScoredPapers(
    papersParams,
    {
      query: {
        queryKey: getListScoredPapersQueryKey(papersParams),
        enabled: Boolean(email),
        retry: false,
      },
    },
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateSettings = useUpdateFeedSettings();
  const [selectedThreshold, setSelectedThreshold] = useState<RelevanceThreshold | null>(null);
  const threshold = selectedThreshold ?? settings?.relevanceThreshold ?? 50;

  useEffect(() => {
    if (settings) {
      setSelectedThreshold(settings.relevanceThreshold);
    }
  }, [settings]);

  useEffect(() => {
    if (!email) {
      navigate('/login', { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (
      (isError && (error.status === 400 || error.status === 404)) ||
      (isSettingsError && (settingsError.status === 400 || settingsError.status === 404))
    ) {
      navigate('/login', { replace: true });
    }
  }, [error, isError, isSettingsError, navigate, settingsError]);

  const handleThresholdChange = (nextThreshold: RelevanceThreshold) => {
    const previousThreshold = settings?.relevanceThreshold ?? 50;
    setSelectedThreshold(nextThreshold);

    updateSettings.mutate(
      {
        data: {
          email,
          relevanceThreshold: nextThreshold,
        },
      },
      {
        onSuccess: (updatedSettings) => {
          queryClient.setQueryData(
            getGetFeedSettingsQueryKey(settingsParams),
            updatedSettings,
          );
          queryClient.invalidateQueries({
            queryKey: ['/api/abstractly/papers'],
          });
        },
        onError: () => {
          setSelectedThreshold(previousThreshold as RelevanceThreshold);
          toast({
            title: 'Could not save your threshold',
            description: 'Your previous filter is still active. Try again in a moment.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  if (!email) {
    return null;
  }

  if (isSettingsLoading || isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col justify-center px-6 md:px-12 text-muted-foreground" data-testid="loading-state">
        <p className="text-lg">Preparing your reading room...</p>
      </div>
    );
  }

  if (isError || isSettingsError) {
    if (
      (isError && (error.status === 400 || error.status === 404)) ||
      (isSettingsError && (settingsError.status === 400 || settingsError.status === 404))
    ) {
      return null;
    }
    return (
      <div className="min-h-[100dvh] flex flex-col justify-center px-6 md:px-12" data-testid="error-state">
        <div className="max-w-xl space-y-6">
          <h1 className="font-serif text-3xl font-medium text-foreground">Could not retrieve feed</h1>
          <p className="text-lg text-foreground/80">{String(error)}</p>
          <Link
            href="/"
            className="inline-block text-lg font-medium underline underline-offset-4 text-primary"
            data-testid="link-signup-error"
          >
            Return home
          </Link>
        </div>
      </div>
    );
  }

  const visiblePapers = papers?.filter((paper) => paper.relevanceScore >= threshold) ?? [];
  const savedTopic = settings?.topic ?? topic;

  return (
    <div className="min-h-[100dvh] w-full max-w-4xl mx-auto px-6 py-16 md:py-24 md:px-12">
      <header className="mb-16 flex flex-col gap-8 border-b border-border pb-12">
        <div>
          <h1 className="text-4xl md:text-5xl font-serif font-medium mb-4 text-foreground">
            Weekly Digest
          </h1>
          <p className="text-lg text-foreground/80 max-w-[60ch] leading-relaxed">
            New research selected and scored for your current topic.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            <span>Show me papers scoring at least:</span>
            <select
              value={threshold}
              onChange={(event) =>
                handleThresholdChange(Number(event.target.value) as RelevanceThreshold)
              }
              disabled={updateSettings.isPending}
              className="h-11 w-48 rounded-none border border-input bg-transparent px-3 text-base font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-60"
              aria-label="Minimum relevance score"
              data-testid="select-relevance-threshold"
            >
              {THRESHOLD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} / 100
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-muted-foreground" role="status">
              {updateSettings.isPending ? 'Saving filter...' : 'Saved for your feed and weekly digest.'}
            </span>
          </label>
          <div className="flex flex-col items-start sm:items-end gap-4">
            <div className="flex items-center gap-1 border-b border-border" role="tablist" aria-label="Feed view">
              {([
                ['all', 'All papers'],
                ['read_later', 'Read Later'],
              ] as const).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={activeView === view}
                  onClick={() => setActiveView(view)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    activeView === view
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`tab-${view}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Link
              href="/signup"
              className="text-sm font-medium hover:underline underline-offset-4 text-muted-foreground hover:text-foreground"
              data-testid="link-signup"
            >
              Edit Subscription
            </Link>
          </div>
        </div>
      </header>
      
      {visiblePapers.length === 0 ? (
        <section className="py-8" data-testid="empty-state">
          <BookOpen className="w-10 h-10 text-primary mb-8" strokeWidth={1} />
          <h2 className="font-serif text-4xl font-medium text-foreground mb-6">
            {activeView === 'read_later' ? 'No saved papers yet' : 'No papers yet'}
          </h2>
          <p className="text-lg text-foreground/80 mb-8 max-w-[65ch] leading-relaxed">
            {activeView === 'read_later'
              ? 'Papers you save with the bookmark button will appear here for easy access.'
              : `Your feed is empty — new papers matching “${savedTopic}” and scoring at least ${threshold} will appear here after the next run.`}
          </p>
          <Link
            href="/signup"
            className="inline-block bg-primary text-primary-foreground px-6 py-3 font-medium rounded-none hover:bg-primary/90"
            data-testid="link-signup-empty"
          >
            Adjust subscription
          </Link>
        </section>
      ) : (
        <main className="space-y-0" data-testid="paper-list">
          {visiblePapers.map((paper, index) => (
            <PaperItem
              key={paper.paperId}
              paper={paper}
              index={index + 1}
              email={email}
              view={activeView}
            />
          ))}
        </main>
      )}

      <footer className="mt-24 pt-12 pb-12 border-t border-border">
        <p className="text-sm text-muted-foreground">End of current selection.</p>
      </footer>
    </div>
  );
}

function PaperItem({
  paper,
  index,
  email,
  view,
}: {
  paper: ScoredPaper;
  index: number;
  email: string;
  view: FeedView;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const saveFeedback = useSavePaperFeedback();
  const setReadLater = useSetReadLater();
  const [rationaleExpanded, setRationaleExpanded] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const handleFeedback = (value: -1 | 1) => {
    const queryKey = getListScoredPapersQueryKey({ email, view });
    setFeedbackMessage('');

    saveFeedback.mutate(
      { data: { paperId: paper.paperId, thumbsUpDown: value } },
      {
        onSuccess: (savedFeedback) => {
          queryClient.setQueryData<ScoredPaper[]>(queryKey, (old) => {
            if (!old) return old;
            return old.map((item) =>
              item.paperId === paper.paperId
                ? { ...item, feedback: savedFeedback.thumbsUpDown }
                : item,
            );
          });
          setFeedbackMessage(savedFeedback.message);
        },
        onError: () => {
          toast({
            title: 'Could not save feedback',
            description: 'Try again in a moment.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleReadLater = () => {
    const saved = !paper.readLater;
    setReadLater.mutate(
      {
        data: {
          email,
          paperId: paper.paperId,
          saved,
        },
      },
      {
        onSuccess: (result) => {
          queryClient.setQueryData<ScoredPaper[]>(
            getListScoredPapersQueryKey({ email, view }),
            (old) => {
              if (!old) return old;
              return saved
                ? old.map((item) =>
                    item.paperId === paper.paperId
                      ? { ...item, readLater: result.saved }
                      : item,
                  )
                : view === 'read_later'
                  ? old.filter((item) => item.paperId !== paper.paperId)
                  : old.map((item) =>
                      item.paperId === paper.paperId
                        ? { ...item, readLater: result.saved }
                        : item,
                    );
            },
          );
          queryClient.invalidateQueries({
            queryKey: ['/api/abstractly/papers'],
            refetchType: 'none',
          });
        },
        onError: () => {
          toast({
            title: 'Could not update Read Later',
            description: 'Try again in a moment.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const isPositive = paper.feedback === 1;
  const isNegative = paper.feedback === -1;

  return (
    <article className="py-12 border-b border-border group" data-testid={`paper-item-${paper.paperId}`}>
      <div className="flex flex-col md:flex-row gap-6 md:gap-12">
        <aside className="md:w-32 flex-shrink-0 flex md:flex-col items-baseline md:items-start gap-4 text-sm font-medium">
          <div className="text-muted-foreground font-serif text-lg italic">
            No. {index.toString().padStart(2, '0')}
          </div>
          <div
            className="text-gold"
            data-testid={`score-paper-${paper.paperId}`}
          >
            Score {paper.relevanceScore}
          </div>
          {paper.year && (
            <div className="text-muted-foreground" data-testid={`year-paper-${paper.paperId}`}>
              {paper.year}
            </div>
          )}
        </aside>

        <div className="flex-1 max-w-[80ch]">
          <h2 className="text-2xl md:text-3xl font-serif font-medium leading-tight mb-3 text-foreground">
            {paper.url ? (
              <a
                href={paper.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors decoration-border underline-offset-4"
                data-testid={`link-paper-${paper.paperId}`}
              >
                {paper.title}
              </a>
            ) : (
              <span data-testid={`title-paper-${paper.paperId}`}>{paper.title}</span>
            )}
          </h2>

          <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button
              type="button"
              onClick={handleReadLater}
              disabled={setReadLater.isPending}
              aria-pressed={paper.readLater}
              aria-label={paper.readLater ? 'Remove from Read Later' : 'Save to Read Later'}
              className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${
                paper.readLater
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-primary'
              } disabled:cursor-wait disabled:opacity-60`}
              data-testid={`button-read-later-${paper.paperId}`}
            >
              <Bookmark
                className={`h-4 w-4 ${paper.readLater ? 'fill-current' : ''}`}
                aria-hidden="true"
              />
              {paper.readLater ? 'Saved to Read Later' : 'Read Later'}
            </button>
            {paper.url && (
              <a
                href={paper.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4"
                data-testid={`link-view-paper-${paper.paperId}`}
              >
                View paper
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>

          {paper.abstract && (
            <div
              className="text-base md:text-lg leading-relaxed text-foreground/85 font-sans mb-8"
              data-testid={`abstract-paper-${paper.paperId}`}
            >
              <p className="line-clamp-3">
                {paper.abstract}
              </p>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={() => setRationaleExpanded(!rationaleExpanded)}
              className="text-sm font-medium text-primary hover:underline underline-offset-4 text-left transition-all duration-200"
              aria-expanded={rationaleExpanded}
              aria-controls={`rationale-${paper.paperId}`}
              data-testid={`button-rationale-${paper.paperId}`}
            >
              {rationaleExpanded
                ? `Hide rationale · Score ${paper.relevanceScore}/100`
                : `Why relevant · Score ${paper.relevanceScore}/100`}
            </button>
            <div
              id={`rationale-${paper.paperId}`}
              className={`overflow-hidden transition-all duration-300 ease-in-out ${rationaleExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
            >
              <p className="text-base text-foreground/80 leading-relaxed py-2 italic font-serif border-l-2 border-border pl-4" data-testid={`rationale-paper-${paper.paperId}`}>
                <span className="not-italic font-sans text-sm font-semibold text-gold">
                  Score {paper.relevanceScore}/100.{' '}
                </span>
                {paper.rationale}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-sm text-muted-foreground">Feedback</span>
            <div className="flex items-center gap-2">
              <button
                className={`inline-flex items-center gap-1.5 text-sm py-1 px-2 border transition-colors ${
                  isPositive
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
                onClick={() => handleFeedback(1)}
                disabled={saveFeedback.isPending}
                data-testid={`button-thumbs-up-${paper.paperId}`}
                aria-label="Relevant"
              >
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                Relevant
              </button>
              <button
                className={`inline-flex items-center gap-1.5 text-sm py-1 px-2 border transition-colors ${
                  isNegative
                    ? 'border-foreground text-foreground bg-foreground/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
                onClick={() => handleFeedback(-1)}
                disabled={saveFeedback.isPending}
                data-testid={`button-thumbs-down-${paper.paperId}`}
                aria-label="Irrelevant"
              >
                <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                Not Relevant
              </button>
            </div>
            <span
              className="text-sm text-muted-foreground"
              role="status"
              data-testid={`status-feedback-${paper.paperId}`}
            >
              {saveFeedback.isPending ? 'Saving...' : feedbackMessage}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
