import mongoose from 'mongoose';

const ArticleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  topic: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  url: {
    type: String,
    default: '',
  },
  urlToImage: {
    type: String,
    default: '',
  },
  tags: {
    type: [String],
    default: [],
  },
  publishedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['pending', 'saved', 'failed'],
    default: 'saved',
  },
});

export default mongoose.models.Article || mongoose.model('Article', ArticleSchema);
