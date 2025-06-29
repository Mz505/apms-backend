import Alert from '../models/Alert.js';

export const createAlert = async (type, title, message, entityType, entityId, triggeredBy, severity = 'info') => {
  try {
    const alert = new Alert({
      type,
      title,
      message,
      severity,
      entityType,
      entityId,
      triggeredBy
    });

    await alert.save();
    return alert;
  } catch (error) {
    console.error('Failed to create alert:', error);
  }
};

export const createUserAlert = async (action, userName, userId, triggeredBy) => {
  const alerts = {
    added: {
      type: 'user_added',
      title: 'New User Added',
      message: `New user "${userName}" has been added to the system`,
      severity: 'success'
    },
    updated: {
      type: 'user_updated',
      title: 'User Updated',
      message: `User "${userName}" details have been updated`,
      severity: 'info'
    },
    deleted: {
      type: 'user_deleted',
      title: 'User Deleted',
      message: `User "${userName}" has been removed from the system`,
      severity: 'warning'
    }
  };

  const alertData = alerts[action];
  if (alertData) {
    return await createAlert(
      alertData.type,
      alertData.title,
      alertData.message,
      'User',
      userId,
      triggeredBy,
      alertData.severity
    );
  }
};

export const createMedicineAlert = async (action, medicineName, medicineId, triggeredBy, additionalInfo = {}) => {
  const alerts = {
    added: {
      type: 'medicine_added',
      title: 'New Medicine Added',
      message: `New medicine "${medicineName}" has been added to inventory`,
      severity: 'success'
    },
    stock_entry: {
      type: 'stock_entry',
      title: 'Stock Entry Recorded',
      message: `Stock entry for "${medicineName}" has been recorded. New quantity: ${additionalInfo.quantity || 'N/A'}`,
      severity: 'info'
    },
    low_stock: {
      type: 'stock_low',
      title: 'Low Stock Alert',
      message: `"${medicineName}" is running low. Current stock: ${additionalInfo.quantity || 0}`,
      severity: 'warning'
    },
    expiring: {
      type: 'medicine_expiring',
      title: 'Medicine Expiring Soon',
      message: `"${medicineName}" will expire on ${additionalInfo.expiryDate || 'N/A'}`,
      severity: 'warning'
    },
    expired: {
      type: 'medicine_expired',
      title: 'Medicine Expired',
      message: `"${medicineName}" has expired and should be removed from inventory`,
      severity: 'danger'
    },
    issued: {
      type: 'medicine_issued',
      title: 'Medicine Issued',
      message: `${additionalInfo.quantity || 0} units of "${medicineName}" issued to ${additionalInfo.recipient || 'N/A'}`,
      severity: 'info'
    }
  };

  const alertData = alerts[action];
  if (alertData) {
    return await createAlert(
      alertData.type,
      alertData.title,
      alertData.message,
      'Medicine',
      medicineId,
      triggeredBy,
      alertData.severity
    );
  }
};

export const checkAndCreateStockAlerts = async (medicine, triggeredBy) => {
  // Check for low stock
  if (medicine.quantity <= medicine.minQuantity) {
    await createMedicineAlert('low_stock', medicine.name, medicine._id, triggeredBy, {
      quantity: medicine.quantity
    });
  }

  // Check for expiring medicines (within 30 days)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  if (medicine.expiryDate <= thirtyDaysFromNow && medicine.expiryDate > new Date()) {
    await createMedicineAlert('expiring', medicine.name, medicine._id, triggeredBy, {
      expiryDate: medicine.expiryDate.toDateString()
    });
  }

  // Check for expired medicines
  if (medicine.expiryDate <= new Date()) {
    await createMedicineAlert('expired', medicine.name, medicine._id, triggeredBy, {
      expiryDate: medicine.expiryDate.toDateString()
    });
  }
};