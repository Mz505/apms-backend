import express from 'express';
import { query, validationResult } from 'express-validator';
import Medicine from '../models/Medicine.js';
import Issuance from '../models/Issuance.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Generate inventory report
router.get('/inventory', authenticateToken, [
  query('category').optional().isString().withMessage('Category must be a string'),
  query('lowStock').optional().isBoolean().withMessage('LowStock must be a boolean'),
  query('expiring').optional().isBoolean().withMessage('Expiring must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { category, lowStock, expiring } = req.query;
    
    // Build query
    const query = { isActive: true };

    if (category) {
      query.category = category;
    }

    if (lowStock === 'true') {
      query.$expr = { $lte: ['$quantity', '$minQuantity'] };
    }

    if (expiring === 'true') {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      query.expiryDate = { $lte: thirtyDaysFromNow, $gt: new Date() };
    }

    const medicines = await Medicine.find(query)
      .populate('createdBy', 'name')
      .sort({ name: 1 });

    // Calculate totals
    const totalMedicines = medicines.length;
    const totalValue = medicines.reduce((sum, med) => sum + (med.quantity * med.price), 0);
    const lowStockCount = medicines.filter(med => med.quantity <= med.minQuantity).length;

    res.json({
      medicines,
      summary: {
        totalMedicines,
        totalValue: Math.round(totalValue * 100) / 100,
        lowStockCount,
        reportGeneratedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Generate inventory report error:', error);
    res.status(500).json({ message: 'Failed to generate inventory report' });
  }
});

// Generate issuance report
router.get('/issuances', authenticateToken, [
  query('startDate').optional().isISO8601().withMessage('Valid start date required'),
  query('endDate').optional().isISO8601().withMessage('Valid end date required'),
  query('issuedTo').optional().isIn(['GIZ Guest', 'AZI Guest', 'Employee']).withMessage('Invalid issuedTo value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { startDate, endDate, issuedTo } = req.query;
    
    // Build query
    const query = {};

    if (startDate || endDate) {
      query.issuedAt = {};
      if (startDate) query.issuedAt.$gte = new Date(startDate);
      if (endDate) query.issuedAt.$lte = new Date(endDate);
    }

    if (issuedTo) {
      query.issuedTo = issuedTo;
    }

    const issuances = await Issuance.find(query)
      .populate('medicineId', 'name category price')
      .populate('issuedBy', 'name')
      .sort({ issuedAt: -1 });

    // Calculate summary
    const totalIssuances = issuances.length;
    const totalQuantity = issuances.reduce((sum, iss) => sum + iss.quantityIssued, 0);
    const totalValue = issuances.reduce((sum, iss) => {
      return sum + (iss.quantityIssued * (iss.medicineId?.price || 0));
    }, 0);

    // Group by recipient type
    const groupedByType = issuances.reduce((acc, iss) => {
      if (!acc[iss.issuedTo]) {
        acc[iss.issuedTo] = { count: 0, quantity: 0 };
      }
      acc[iss.issuedTo].count += 1;
      acc[iss.issuedTo].quantity += iss.quantityIssued;
      return acc;
    }, {});

    res.json({
      issuances,
      summary: {
        totalIssuances,
        totalQuantity,
        totalValue: Math.round(totalValue * 100) / 100,
        groupedByType,
        reportGeneratedAt: new Date(),
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });
  } catch (error) {
    console.error('Generate issuance report error:', error);
    res.status(500).json({ message: 'Failed to generate issuance report' });
  }
});

// Generate expiry report
router.get('/expiry', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

    // Expired medicines
    const expired = await Medicine.find({
      isActive: true,
      expiryDate: { $lt: now }
    }).sort({ expiryDate: 1 });

    // Expiring within 30 days
    const expiringSoon = await Medicine.find({
      isActive: true,
      expiryDate: { $gte: now, $lte: thirtyDaysFromNow }
    }).sort({ expiryDate: 1 });

    // Expiring within 60 days
    const expiringLater = await Medicine.find({
      isActive: true,
      expiryDate: { $gt: thirtyDaysFromNow, $lte: sixtyDaysFromNow }
    }).sort({ expiryDate: 1 });

    res.json({
      expired,
      expiringSoon,
      expiringLater,
      summary: {
        expiredCount: expired.length,
        expiringSoonCount: expiringSoon.length,
        expiringLaterCount: expiringLater.length,
        reportGeneratedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Generate expiry report error:', error);
    res.status(500).json({ message: 'Failed to generate expiry report' });
  }
});

export default router;