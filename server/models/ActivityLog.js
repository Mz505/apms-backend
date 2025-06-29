import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  actionType: {
    type: String,
    required: true,
    enum: ['Add', 'Update', 'Delete', 'Issue', 'Login', 'Logout', 'Stock In', 'Stock Out']
  },
  entityType: {
    type: String,
    required: true,
    enum: ['Medicine', 'User', 'Issuance', 'System']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  oldData: {
    type: mongoose.Schema.Types.Mixed
  },
  newData: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Create indexes for better performance
activityLogSchema.index({ performedBy: 1, createdAt: -1 });
activityLogSchema.index({ actionType: 1, createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1 });

export default mongoose.model('ActivityLog', activityLogSchema);