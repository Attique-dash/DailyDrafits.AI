import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/mongodb';
import Article from '@/app/models/Article';

// GET all articles
export async function GET() {
  try {
    await connectDB();
    const articles = await Article.find({}).sort({ createdAt: -1 });
    return NextResponse.json({ articles });
  } catch (error) {
    console.error('Error fetching articles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch articles' },
      { status: 500 }
    );
  }
}

// POST create new article
export async function POST(req: Request) {
  try {
    const body = await req.json();
    await connectDB();
    
    const article = await Article.create({
      title: body.title,
      description: body.description,
      topic: body.topic,
      createdAt: body.createdAt || new Date(),
      url: body.url || '',
      urlToImage: body.urlToImage || '',
      tags: body.tags || [],
      publishedAt: body.publishedAt || new Date(),
      status: body.status || 'saved',
    });
    
    return NextResponse.json({ article }, { status: 201 });
  } catch (error) {
    console.error('Error creating article:', error);
    return NextResponse.json(
      { error: 'Failed to create article' },
      { status: 500 }
    );
  }
}
