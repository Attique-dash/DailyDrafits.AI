import { NextResponse } from 'next/server';
import connectDB from '@/app/lib/mongodb';
import Analytics from '@/app/models/Analytics';

// GET analytics
export async function GET() {
  try {
    await connectDB();
    let analytics = await Analytics.findOne();
    if (!analytics) {
      analytics = await Analytics.create({});
    }
    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

// POST update analytics
export async function POST(req: Request) {
  try {
    const body = await req.json();
    await connectDB();
    
    let analytics = await Analytics.findOne();
    if (!analytics) {
      analytics = await Analytics.create({
        totalPosts: body.totalPosts || 0,
        todayPosts: body.todayPosts || 0,
        thisWeekPosts: body.thisWeekPosts || 0,
        generatedTopics: body.generatedTopics || {},
      });
    } else {
      analytics.totalPosts = body.totalPosts ?? analytics.totalPosts;
      analytics.todayPosts = body.todayPosts ?? analytics.todayPosts;
      analytics.thisWeekPosts = body.thisWeekPosts ?? analytics.thisWeekPosts;
      analytics.lastUpdated = new Date();
      if (body.generatedTopics) {
        analytics.generatedTopics = { ...analytics.generatedTopics, ...body.generatedTopics };
      }
      await analytics.save();
    }
    
    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('Error updating analytics:', error);
    return NextResponse.json(
      { error: 'Failed to update analytics' },
      { status: 500 }
    );
  }
}
