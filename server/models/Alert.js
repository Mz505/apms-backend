import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['user_added', 'stock_low', 'medicine_expiring', 'medicine_expired', 'stock_entry', 'medicine_issued', 'user_deleted', 'medicine_added', 'system']
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'danger', 'success'],
    default: 'info'
  },
  entityType: {
    type: String,
    enum: ['User', 'Medicine', 'Issuance', 'System'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  triggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
  }
}, {
  timestamps: true
});

// Create indexes for better performance
alertSchema.index({ isRead: 1, isActive: 1, createdAt: -1 });
alertSchema.index({ type: 1, createdAt: -1 });
alertSchema.index({ triggeredBy: 1 });
alertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Alert', alertSchema);