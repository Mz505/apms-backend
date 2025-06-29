import express from 'express';
import Medicine from '../models/Medicine.js';
import Issuance from '../models/Issuance.js';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get dashboard statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Basic counts
    const totalMedicines = await Medicine.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments({ isActive: true });
    
    // Low stock medicines
    const lowStockMedicines = await Medicine.countDocuments({
      isActive: true,
      $expr: { $lte: ['$quantity', '$minQuantity'] }
    });

    // Expiring medicines (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringMedicines = await Medicine.countDocuments({
      isActive: true,
      expiryDate: { $lte: thirtyDaysFromNow, $gt: new Date() }
    });

    // Today's issuances
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayIssuances = await Issuance.countDocuments({
      issuedAt: { $gte: today, $lt: tomorrow }
    });

    // This month's issuances
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyIssuances = await Issuance.countDocuments({
      issuedAt: { $gte: startOfMonth }
    });

    // Total stock value
    const medicines = await Medicine.find({ isActive: true }, 'quantity price');
    const totalStockValue = medicines.reduce((total, med) => total + (med.quantity * med.price), 0);

    res.json({
      totalMedicines,
      totalUsers,
      lowStockMedicines,
      expiringMedicines,
      todayIssuances,
      monthlyIssuances,
      totalStockValue: Math.round(totalStockValue * 100) / 100
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
  }
});

// Get recent activities
router.get('/recent-activities', authenticateToken, async (req, res) => {
  try {
    const activities = await ActivityLog.find()
      .populate('performedBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(activities);
  } catch (error) {
    console.error('Get recent activities error:', error);
    res.status(500).json({ message: 'Failed to fetch recent activities' });
  }
});

// Get issuance trends (last 7 days)
router.get('/issuance-trends', authenticateToken, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trends = await Issuance.aggregate([
      {
        $match: {
          issuedAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$issuedAt' } }
          },
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantityIssued' }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    res.json(trends);
  } catch (error) {
    console.error('Get issuance trends error:', error);
    res.status(500).json({ message: 'Failed to fetch issuance trends' });
  }
});

// Get category distribution
router.get('/category-distribution', authenticateToken, async (req, res) => {
  try {
    const distribution = await Medicine.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalValue: { $sum: { $multiply: ['$quantity', '$price'] } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json(distribution);
  } catch (error) {
    console.error('Get category distribution error:', error);
    res.status(500).json({ message: 'Failed to fetch category distribution' });
  }
});

export default router;