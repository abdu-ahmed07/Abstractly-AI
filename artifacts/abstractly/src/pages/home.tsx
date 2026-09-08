import { useState } from 'react';
import {
  getListScoredPapersQueryKey,
  useListScoredPapers,
  useSavePaperFeedback,
  type ScoredPaper,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, ExternalLink, Loader2, BookOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

export function Home() {
  const { data: papers, isLoading, isError, error } = useListScoredPapers();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-muted-foreground" data-testid="loading-state">
        <Loader2 className="w-6 h-6 animate-spin mb-4" />
        <p className="text-sm">Fetching research feed...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center" data-testid="error-state">
        <div className="max-w-md space-y-4">
          <p className="text-destructive font-medium">Failed to load papers</p>
          <p className="text-sm text-muted-foreground">{String(error)}</p>
        </div>
      </div>
    );
  }

  if (!papers || papers.length === 0) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center" data-testid="empty-state">
        <BookOpen className="w-8 h-8 text-muted-foreground mb-4 opacity-50" />
        <h2 className="font-serif text-xl font-medium text-foreground mb-2">No papers found</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your research feed is currently empty. Check back later for new machine-ranked academic papers.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-3xl mx-auto px-6 py-16 md:py-24 space-y-16">
      <header className="mb-16">
        <h1 className="text-3xl md:text-4xl font-serif font-medium tracking-tight mb-3 text-foreground">
          Abstractly
        </h1>
        <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed">
          Your focused research feed. Machine-ranked papers sorted by relevance to your current studies.
        </p>
      </header>
      
      <main className="space-y-16" data-testid="paper-list">
        {papers.map((paper) => (
          <PaperItem key={paper.paperId} paper={paper} />
        ))}
      </main>

      <footer className="pt-16 pb-8 text-center text-xs text-muted-foreground border-t border-border/50">
        <p>End of feed.</p>
      </footer>
    </div>
  );
}

function PaperItem({ paper }: { paper: ScoredPaper }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const saveFeedback = useSavePaperFeedback();
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const handleFeedback = (value: -1 | 1) => {
    const queryKey = getListScoredPapersQueryKey();
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
            title: 'Failed to save feedback',
            description: 'Please try again later.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const isPositive = paper.feedback === 1;
  const isNegative = paper.feedback === -1;

  return (
    <article className="group" data-testid={`paper-item-${paper.paperId}`}>
      <div className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-4 mb-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary uppercase tracking-wider" data-testid={`score-paper-${paper.paperId}`}>
            Score {paper.relevanceScore}
          </span>
          {paper.year && (
            <span className="text-sm text-muted-foreground" data-testid={`year-paper-${paper.paperId}`}>{paper.year}</span>
          )}
        </div>
      </div>
      
      <h2 className="text-xl md:text-2xl font-serif font-medium leading-snug mb-4 text-foreground">
        {paper.url ? (
          <a 
            href={paper.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:underline underline-offset-4 decoration-muted-foreground/30 flex items-baseline gap-2"
            data-testid={`link-paper-${paper.paperId}`}
          >
            {paper.title}
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 inline-block" />
          </a>
        ) : (
          <span data-testid={`title-paper-${paper.paperId}`}>{paper.title}</span>
        )}
      </h2>

      <div className="space-y-4 mb-6 text-[15px] leading-relaxed text-foreground/80 font-serif">
        <p className="px-4 py-3 bg-white border border-border/50 rounded-md text-sm font-sans text-muted-foreground shadow-sm" data-testid={`rationale-paper-${paper.paperId}`}>
          <strong className="font-medium text-foreground mr-2">Rationale:</strong> 
          {paper.rationale}
        </p>

        {paper.abstract && (
          <div className="prose prose-sm md:prose-base prose-stone max-w-none text-foreground/80 font-serif" data-testid={`abstract-paper-${paper.paperId}`}>
            <p>{paper.abstract}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className={`h-8 px-3 transition-colors ${
            isPositive 
              ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground' 
              : 'bg-transparent text-muted-foreground hover:bg-secondary border-border/60 hover:text-foreground'
          }`}
          onClick={() => handleFeedback(1)}
          disabled={saveFeedback.isPending}
           data-testid={`button-thumbs-up-${paper.paperId}`}
          aria-label="Thumbs up"
        >
          <ThumbsUp className={`w-4 h-4 mr-1.5 ${isPositive ? 'fill-current' : ''}`} />
          <span className="text-xs font-medium">Relevant</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 px-3 transition-colors ${
            isNegative 
              ? 'bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90 hover:text-destructive-foreground' 
              : 'bg-transparent text-muted-foreground hover:bg-secondary border-border/60 hover:text-foreground'
          }`}
          onClick={() => handleFeedback(-1)}
          disabled={saveFeedback.isPending}
           data-testid={`button-thumbs-down-${paper.paperId}`}
          aria-label="Thumbs down"
        >
          <ThumbsDown className={`w-4 h-4 mr-1.5 ${isNegative ? 'fill-current' : ''}`} />
          <span className="text-xs font-medium">Irrelevant</span>
        </Button>
        <span
          className="min-w-24 text-xs text-muted-foreground"
          role="status"
          data-testid={`status-feedback-${paper.paperId}`}
        >
          {saveFeedback.isPending ? 'Saving...' : feedbackMessage}
        </span>
      </div>
    </article>
  );
}
