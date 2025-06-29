import express from 'express';
import { query, validationResult } from 'express-validator';
import Alert from '../models/Alert.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all alerts for current user
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('type').optional().isString().withMessage('Type must be a string'),
  query('severity').optional().isIn(['info', 'warning', 'danger', 'success']).withMessage('Invalid severity'),
  query('isRead').optional().isBoolean().withMessage('IsRead must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 20,
      type,
      severity,
      isRead
    } = req.query;

    // Build query
    const query = { isActive: true };

    if (type) {
      query.type = type;
    }

    if (severity) {
      query.severity = severity;
    }

    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const alerts = await Alert.find(query)
      .populate('triggeredBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Alert.countDocuments(query);
    const unreadCount = await Alert.countDocuments({ isActive: true, isRead: false });

    res.json({
      alerts,
      unreadCount,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ message: 'Failed to fetch alerts' });
  }
});

// Mark alert as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    res.json(alert);
  } catch (error) {
    console.error('Mark alert as read error:', error);
    res.status(500).json({ message: 'Failed to mark alert as read' });
  }
});

// Mark all alerts as read
router.patch('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    await Alert.updateMany(
      { isActive: true, isRead: false },
      { isRead: true }
    );

    res.json({ message: 'All alerts marked as read' });
  } catch (error) {
    console.error('Mark all alerts as read error:', error);
    res.status(500).json({ message: 'Failed to mark all alerts as read' });
  }
});

// Delete alert
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    res.json({ message: 'Alert deleted successfully' });
  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({ message: 'Failed to delete alert' });
  }
});

// Get alert details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate('triggeredBy', 'name role email');

    if (!alert || !alert.isActive) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    res.json(alert);
  } catch (error) {
    console.error('Get alert details error:', error);
    res.status(500).json({ message: 'Failed to fetch alert details' });
  }
});

export default router;