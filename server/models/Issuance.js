import mongoose from 'mongoose';

const issuanceSchema = new mongoose.Schema({
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true
  },
  issuedTo: {
    type: String,
    required: true,
    enum: ['GIZ Guest', 'AZI Guest', 'Employee']
  },
  recipientName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  recipientID: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  quantityIssued: {
    type: Number,
    required: true,
    min: 1
  },
  prescribedBy: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  issuedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create indexes for better performance
issuanceSchema.index({ medicineId: 1, issuedAt: -1 });
issuanceSchema.index({ issuedTo: 1, issuedAt: -1 });
issuanceSchema.index({ recipientID: 1 });
issuanceSchema.index({ issuedBy: 1 });

export default mongoose.model('Issuance', issuanceSchema);