export interface Article {
    id: string;
    title: string;
    description: string;
    url?: string;
    urlToImage?: string;
    tags?: string[];
    publishedAt?: string;
    createdAt?: string;  // Add this new property
    topic?: string;     // Add this new property
  }