import mongoose from 'mongoose';

const AnalyticsSchema = new mongoose.Schema({
  totalPosts: {
    type: Number,
    default: 0,
  },
  todayPosts: {
    type: Number,
    default: 0,
  },
  thisWeekPosts: {
    type: Number,
    default: 0,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  generatedTopics: {
    type: Map,
    of: Date,
    default: {},
  },
});

export default mongoose.models.Analytics || mongoose.model('Analytics', AnalyticsSchema);
