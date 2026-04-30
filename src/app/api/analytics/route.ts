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
    // Return default values if MongoDB is not connected
    return NextResponse.json({
      analytics: {
        totalPosts: 0,
        todayPosts: 0,
        thisWeekPosts: 0,
        lastUpdated: null,
        generatedTopics: {},
      }
    });
  }
}

// POST update analytics
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
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
        // Convert Mongoose Map to plain object to avoid casting errors
        const currentTopics = analytics.generatedTopics instanceof Map
          ? Object.fromEntries(analytics.generatedTopics)
          : analytics.generatedTopics || {};
        analytics.generatedTopics = { ...currentTopics, ...body.generatedTopics };
      }
      await analytics.save();
    }

    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('Error updating analytics:', error);
    // Return default values if MongoDB is not connected
    return NextResponse.json({
      analytics: {
        totalPosts: body.totalPosts || 0,
        todayPosts: body.todayPosts || 0,
        thisWeekPosts: body.thisWeekPosts || 0,
        lastUpdated: new Date().toISOString(),
        generatedTopics: body.generatedTopics || {},
      }
    });
  }
}
