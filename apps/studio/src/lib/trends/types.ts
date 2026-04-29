export interface TrendItem {
  title: string;
  source: string; // "google" | "google-keyword" | "naver-datalab" | "naver-news" | "naver-blog" | "youtube" | "youtube-search" | "hackernews" | "hackernews-search"
  url?: string;
  description?: string;
  rank?: number;
  keyword?: string; // the keyword that triggered this result (keyword-based search only)
  fetchedAt: Date;
}

export interface TrendProvider {
  name: string;
  fetch(opts?: TrendProviderOpts): Promise<TrendItem[]>;
}

export interface TrendProviderOpts {
  keywords?: string[];
  geo?: string;
  /** Reddit-only: subreddits to query. When omitted, provider uses its default. */
  subreddits?: string[];
}
