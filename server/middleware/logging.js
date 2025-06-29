import ActivityLog from '../models/ActivityLog.js';

export const logActivity = async (actionType, entityType, entityId, performedBy, description, oldData = null, newData = null, req = null) => {
  try {
    const logEntry = new ActivityLog({
      actionType,
      entityType,
      entityId,
      performedBy,
      description,
      oldData,
      newData,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('User-Agent')
    });

    await logEntry.save();
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};