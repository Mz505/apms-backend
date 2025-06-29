import express from 'express';
import { body, query, validationResult } from 'express-validator';
import Issuance from '../models/Issuance.js';
import Medicine from '../models/Medicine.js';
import { authenticateToken } from '../middleware/auth.js';
import { logActivity } from '../middleware/logging.js';
import { createMedicineAlert, checkAndCreateStockAlerts } from '../middleware/alertService.js';

const router = express.Router();

// Get all issuances with filtering and pagination
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
  query('issuedTo').optional().isIn(['GIZ Guest', 'AZI Guest', 'Employee']).withMessage('Invalid issuedTo value'),
  query('startDate').optional().isISO8601().withMessage('Valid start date required'),
  query('endDate').optional().isISO8601().withMessage('Valid end date required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 20,
      issuedTo,
      startDate,
      endDate,
      sortBy = 'issuedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};

    if (issuedTo) {
      query.issuedTo = issuedTo;
    }

    if (startDate || endDate) {
      query.issuedAt = {};
      if (startDate) query.issuedAt.$gte = new Date(startDate);
      if (endDate) query.issuedAt.$lte = new Date(endDate);
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const issuances = await Issuance.find(query)
      .populate('medicineId', 'name category')
      .populate('issuedBy', 'name')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Issuance.countDocuments(query);

    res.json({
      issuances,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get issuances error:', error);
    res.status(500).json({ message: 'Failed to fetch issuances' });
  }
});

// Issue medicine
router.post('/', authenticateToken, [
  body('medicineId').isMongoId().withMessage('Valid medicine ID required'),
  body('issuedTo').isIn(['GIZ Guest', 'AZI Guest', 'Employee']).withMessage('Invalid recipient type'),
  body('recipientName').trim().isLength({ min: 1, max: 200 }).withMessage('Recipient name required (max 200 chars)'),
  body('recipientID').trim().isLength({ min: 1, max: 100 }).withMessage('Recipient ID required (max 100 chars)'),
  body('quantityIssued').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('prescribedBy').trim().isLength({ min: 1, max: 200 }).withMessage('Prescribed by required (max 200 chars)'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes max 500 chars')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { medicineId, quantityIssued } = req.body;

    // Check if medicine exists and has sufficient stock
    const medicine = await Medicine.findById(medicineId);
    if (!medicine || !medicine.isActive) {
      return res.status(404).json({ message: 'Medicine not found' });
    }

    if (medicine.quantity < quantityIssued) {
      return res.status(400).json({ 
        message: `Insufficient stock. Available: ${medicine.quantity}, Requested: ${quantityIssued}` 
      });
    }

    // Check if medicine is expired
    if (medicine.expiryDate <= new Date()) {
      return res.status(400).json({ message: 'Cannot issue expired medicine' });
    }

    // Create issuance record
    const issuance = new Issuance({
      ...req.body,
      issuedBy: req.user._id
    });
    await issuance.save();

    // Update medicine stock
    const oldQuantity = medicine.quantity;
    medicine.quantity -= quantityIssued;
    medicine.updatedBy = req.user._id;
    await medicine.save();

    // Populate issuance data
    // await issuance.populate(['medicineId issuedBy', 'name']);

    await issuance.populate([
  { path: 'medicineId', select: 'name category' },
  { path: 'issuedBy', select: 'name' }
]);


    // Log activity
    await logActivity(
      'Issue', 
      'Medicine', 
      medicine._id, 
      req.user._id, 
      `Issued ${quantityIssued} units of ${medicine.name} to ${req.body.recipientName} (${req.body.issuedTo})`,
      { quantity: oldQuantity },
      { quantity: medicine.quantity },
      req
    );

    // Create issuance alert
    await createMedicineAlert('issued', medicine.name, medicine._id, req.user._id, {
      quantity: quantityIssued,
      recipient: req.body.recipientName
    });

    // Check and create stock alerts after issuance
    await checkAndCreateStockAlerts(medicine, req.user._id);

    res.status(201).json(issuance);
  } catch (error) {
    console.error('Issue medicine error:', error);
    res.status(500).json({ message: 'Failed to issue medicine' });
  }
});

// Get single issuance
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const issuance = await Issuance.findById(req.params.id)
      .populate('medicineId', 'name category')
      .populate('issuedBy', 'name');

    if (!issuance) {
      return res.status(404).json({ message: 'Issuance not found' });
    }

    res.json(issuance);
  } catch (error) {
    console.error('Get issuance error:', error);
    res.status(500).json({ message: 'Failed to fetch issuance' });
  }
});

export default router;