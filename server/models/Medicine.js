import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  barcode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Antibiotics', 'Painkillers', 'Supplements', 'Vaccines',
      'Antiseptics', 'Cardiovascular', 'Respiratory',
      'Digestive', 'Neurological', 'Other'
    ]
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  initialStock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  minQuantity: {
    type: Number,
    required: true,
    min: 1,
    default: 10
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  expiryDate: {
    type: Date,
    required: true
  },
  supplier: {
    type: String,
    trim: true,
    maxlength: 200
  },
  batchNumber: {
    type: String,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// ✅ Indexes for better performance
medicineSchema.index({ name: 'text', category: 1 });
medicineSchema.index({ barcode: 1 });
medicineSchema.index({ expiryDate: 1 });
medicineSchema.index({ quantity: 1, minQuantity: 1 });

// ✅ Virtuals
medicineSchema.virtual('isLowStock').get(function () {
  return this.quantity <= this.minQuantity;
});

medicineSchema.virtual('isExpired').get(function () {
  return new Date() > this.expiryDate;
});

medicineSchema.virtual('isExpiringSoon').get(function () {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return this.expiryDate <= thirtyDaysFromNow && this.expiryDate > new Date();
});

// ✅ Virtual stockOut (calculated, not stored)
medicineSchema.virtual('stockOut').get(function () {
  return (this.initialStock || 0) - (this.quantity || 0);
});

// ✅ Ensure virtuals are serialized when converting to JSON
medicineSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Medicine', medicineSchema);
