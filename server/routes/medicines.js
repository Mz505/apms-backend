import express from 'express';
import { body, query, validationResult } from 'express-validator';
import Medicine from '../models/Medicine.js';
import { authenticateToken } from '../middleware/auth.js';
import { logActivity } from '../middleware/logging.js';
import { createMedicineAlert, checkAndCreateStockAlerts } from '../middleware/alertService.js';

const router = express.Router();

// Get all medicines with filtering and pagination
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isString(),
  query('search').optional().isString(),
  query('lowStock').optional().isBoolean(),
  query('expiring').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { page = 1, limit = 20, category, search, lowStock, expiring, sortBy = 'name', sortOrder = 'asc' } = req.query;
    const query = { isActive: true };

    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { supplier: { $regex: search, $options: 'i' } },
        { batchNumber: { $regex: search, $options: 'i' } }
      ];
    }
    if (lowStock === 'true') query.$expr = { $lte: ['$quantity', '$minQuantity'] };
    if (expiring === 'true') {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      query.expiryDate = { $lte: thirtyDaysFromNow, $gt: new Date() };
    }

    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const medicines = await Medicine.find(query)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Medicine.countDocuments(query);
    res.json({ medicines, pagination: { current: parseInt(page), pages: Math.ceil(total / parseInt(limit)), total, limit: parseInt(limit) } });
  } catch (error) {
    console.error('Get medicines error:', error);
    res.status(500).json({ message: 'Failed to fetch medicines' });
  }
});

// Get single medicine
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id).populate('createdBy', 'name').populate('updatedBy', 'name');
    if (!medicine || !medicine.isActive) return res.status(404).json({ message: 'Medicine not found' });
    res.json(medicine);
  } catch (error) {
    console.error('Get medicine error:', error);
    res.status(500).json({ message: 'Failed to fetch medicine' });
  }
});

// Add new medicine
router.post('/', authenticateToken, [
  body('name').trim().isLength({ min: 1, max: 200 }),
  body('category').isIn(['Antibiotics', 'Painkillers', 'Supplements', 'Vaccines', 'Antiseptics', 'Cardiovascular', 'Respiratory', 'Digestive', 'Neurological', 'Other']),
  body('quantity').isInt({ min: 0 }),
  body('minQuantity').isInt({ min: 1 }),
  body('price').isFloat({ min: 0 }),
  body('expiryDate').isISO8601(),
  body('barcode').optional().trim().isLength({ max: 100 }),
  body('supplier').optional().trim().isLength({ max: 200 }),
  body('batchNumber').optional().trim().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const medicineData = {
      ...req.body,
      initialStock: req.body.quantity,
      stockOut: 0,
      createdBy: req.user._id
    };

    if (medicineData.barcode) {
      const existingMedicine = await Medicine.findOne({ barcode: medicineData.barcode, isActive: true });
      if (existingMedicine) return res.status(400).json({ message: 'Medicine with this barcode already exists' });
    }

    const medicine = new Medicine(medicineData);
    await medicine.save();
    await medicine.populate('createdBy', 'name');
    await logActivity('Add', 'Medicine', medicine._id, req.user._id, `Added new medicine: ${medicine.name}`, null, medicineData, req);
    await createMedicineAlert('added', medicine.name, medicine._id, req.user._id);
    await checkAndCreateStockAlerts(medicine, req.user._id);

    res.status(201).json(medicine);
  } catch (error) {
    console.error('Add medicine error:', error);
    res.status(error.code === 11000 ? 400 : 500).json({ message: error.code === 11000 ? 'Medicine with this barcode already exists' : 'Failed to add medicine' });
  }
});

// Update medicine
router.put('/:id', authenticateToken, [
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('category').optional().isIn(['Antibiotics', 'Painkillers', 'Supplements', 'Vaccines', 'Antiseptics', 'Cardiovascular', 'Respiratory', 'Digestive', 'Neurological', 'Other']),
  body('quantity').optional().isInt({ min: 0 }),
  body('minQuantity').optional().isInt({ min: 1 }),
  body('price').optional().isFloat({ min: 0 }),
  body('expiryDate').optional().isISO8601(),
  body('barcode').optional().trim().isLength({ max: 100 }),
  body('supplier').optional().trim().isLength({ max: 200 }),
  body('batchNumber').optional().trim().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const medicine = await Medicine.findById(req.params.id);
    if (!medicine || !medicine.isActive) return res.status(404).json({ message: 'Medicine not found' });

    const oldData = medicine.toObject();
    const oldQuantity = medicine.quantity;

    if (req.body.barcode && req.body.barcode !== medicine.barcode) {
      const existing = await Medicine.findOne({ barcode: req.body.barcode, isActive: true, _id: { $ne: medicine._id } });
      if (existing) return res.status(400).json({ message: 'Medicine with this barcode already exists' });
    }

    const stockToAdd = parseInt(req.body.stockToAdd) || 0;
    if (stockToAdd > 0) {
      medicine.quantity += stockToAdd;
      medicine.initialStock += stockToAdd;
    }

    Object.assign(medicine, {
      name: req.body.name ?? medicine.name,
      category: req.body.category ?? medicine.category,
      price: req.body.price ?? medicine.price,
      expiryDate: req.body.expiryDate ?? medicine.expiryDate,
      supplier: req.body.supplier ?? medicine.supplier,
      batchNumber: req.body.batchNumber ?? medicine.batchNumber,
      barcode: req.body.barcode ?? medicine.barcode,
      description: req.body.description ?? medicine.description
    });

    medicine.stockOut = medicine.initialStock - medicine.quantity;
    medicine.updatedBy = req.user._id;
    await medicine.save();

    await medicine.populate(['createdBy updatedBy', 'name']);
    await logActivity('Update', 'Medicine', medicine._id, req.user._id, `Updated medicine: ${medicine.name}`, oldData, medicine.toObject(), req);

    if (req.body.quantity && req.body.quantity > oldQuantity) {
      await createMedicineAlert('stock_entry', medicine.name, medicine._id, req.user._id, {
        quantity: medicine.quantity
      });
    }

    await checkAndCreateStockAlerts(medicine, req.user._id);
    res.json(medicine);
  } catch (error) {
    console.error('Update medicine error:', error);
    res.status(error.code === 11000 ? 400 : 500).json({ message: error.code === 11000 ? 'Medicine with this barcode already exists' : 'Failed to update medicine' });
  }
});

// Delete medicine
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine || !medicine.isActive) return res.status(404).json({ message: 'Medicine not found' });

    const oldData = medicine.toObject();
    medicine.isActive = false;
    medicine.updatedBy = req.user._id;
    await medicine.save();

    await logActivity('Delete', 'Medicine', medicine._id, req.user._id, `Deleted medicine: ${medicine.name}`, oldData, { isActive: false }, req);
    res.json({ message: 'Medicine deleted successfully' });
  } catch (error) {
    console.error('Delete medicine error:', error);
    res.status(500).json({ message: 'Failed to delete medicine' });
  }
});

// Get low stock medicines
router.get('/alerts/low-stock', authenticateToken, async (req, res) => {
  try {
    const lowStockMedicines = await Medicine.find({
      isActive: true,
      $expr: { $lte: ['$quantity', '$minQuantity'] }
    }).populate('createdBy', 'name');

    res.json(lowStockMedicines);
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ message: 'Failed to fetch low stock medicines' });
  }
});

// Get expiring medicines
router.get('/alerts/expiring', authenticateToken, async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringMedicines = await Medicine.find({
      isActive: true,
      expiryDate: { $lte: thirtyDaysFromNow, $gt: new Date() }
    }).populate('createdBy', 'name');

    res.json(expiringMedicines);
  } catch (error) {
    console.error('Get expiring medicines error:', error);
    res.status(500).json({ message: 'Failed to fetch expiring medicines' });
  }
});

export default router;
