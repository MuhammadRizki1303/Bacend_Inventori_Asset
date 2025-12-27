import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface DeviceStock extends RowDataPacket {
  id: number;
  name: string;
  category: string;
  total_stock: number;
  available_stock: number;
  borrowed_count: number;
  created_at: string;
}

interface BorrowingItem extends RowDataPacket {
  id: number;
  employee_name: string;
  device_id: number;
  device_name: string;
  quantity: number;
  borrow_date: string;
  return_date: string;
  status: 'borrowed' | 'returned';
  created_at: string;
  updated_at: string;
}

export const getAllBorrowings = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT * FROM borrowings 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (employee_name LIKE ? OR device_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const [borrowings] = await pool.query<BorrowingItem[]>(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM borrowings WHERE 1=1';
    const countParams: any[] = [];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (search) {
      countQuery += ' AND (employee_name LIKE ? OR device_name LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const [countResult] = await pool.query<RowDataPacket[]>(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      items: borrowings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get borrowings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getDeviceStocks = async (req: Request, res: Response) => {
  try {
    const [devices] = await pool.query<DeviceStock[]>(`
      SELECT * FROM device_stocks 
      ORDER BY category, name
    `);

    res.json(devices);
  } catch (error) {
    console.error('Get device stocks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createBorrowing = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      employee_name,
      device_id,
      quantity,
      borrow_date,
      return_date
    } = req.body;

    // Validate required fields
    if (!employee_name || !device_id || !quantity || !borrow_date || !return_date) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if device exists and has enough stock
    const [devices] = await connection.query<DeviceStock[]>(
      'SELECT * FROM device_stocks WHERE id = ? FOR UPDATE',
      [device_id]
    );

    if (devices.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Device not found' });
    }

    const device = devices[0];

    if (device.available_stock < quantity) {
      await connection.rollback();
      return res.status(400).json({ 
        message: `Not enough stock available. Only ${device.available_stock} units left.` 
      });
    }

    // Create borrowing record
    const [borrowingResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO borrowings 
      (employee_name, device_id, device_name, quantity, borrow_date, return_date, status) 
      VALUES (?, ?, ?, ?, ?, ?, 'borrowed')`,
      [employee_name, device_id, device.name, quantity, borrow_date, return_date]
    );

    // Update device stock
    await connection.query(
      `UPDATE device_stocks 
      SET available_stock = available_stock - ?, 
          borrowed_count = borrowed_count + ? 
      WHERE id = ?`,
      [quantity, quantity, device_id]
    );

    // Log activity
    const userId = (req as any).user.userId;
    await connection.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Created borrowing', 'borrowing', borrowingResult.insertId, 
       JSON.stringify({ employee_name, device_name: device.name, quantity })]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Borrowing created successfully',
      borrowingId: borrowingResult.insertId
    });

  } catch (error) {
    await connection.rollback();
    console.error('Create borrowing error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

export const returnBorrowing = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Get borrowing details
    const [borrowings] = await connection.query<BorrowingItem[]>(
      'SELECT * FROM borrowings WHERE id = ? AND status = "borrowed" FOR UPDATE',
      [id]
    );

    if (borrowings.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Borrowing not found or already returned' });
    }

    const borrowing = borrowings[0];

    // Update borrowing status
    await connection.query(
      'UPDATE borrowings SET status = "returned", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    // Update device stock
    await connection.query(
      `UPDATE device_stocks 
      SET available_stock = available_stock + ?, 
          borrowed_count = borrowed_count - ? 
      WHERE id = ?`,
      [borrowing.quantity, borrowing.quantity, borrowing.device_id]
    );

    // Log activity
    const userId = (req as any).user.userId;
    await connection.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Returned borrowing', 'borrowing', id, 
       JSON.stringify({ employee_name: borrowing.employee_name, device_name: borrowing.device_name })]
    );

    await connection.commit();

    res.json({ message: 'Device returned successfully' });

  } catch (error) {
    await connection.rollback();
    console.error('Return borrowing error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

export const createDevice = async (req: Request, res: Response) => {
  try {
    const {
      name,
      category,
      total_stock
    } = req.body;

    if (!name || !category || !total_stock) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO device_stocks 
      (name, category, total_stock, available_stock, borrowed_count) 
      VALUES (?, ?, ?, ?, 0)`,
      [name, category, total_stock, total_stock]
    );

    // Log activity
    const userId = (req as any).user.userId;
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Created device', 'device', result.insertId, 
       JSON.stringify({ name, category, total_stock })]
    );

    res.status(201).json({
      message: 'Device created successfully',
      deviceId: result.insertId
    });

  } catch (error) {
    console.error('Create device error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateDeviceStock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { total_stock } = req.body;

    if (!total_stock || total_stock < 0) {
      return res.status(400).json({ message: 'Valid total stock is required' });
    }

    // Get current device info
    const [devices] = await pool.query<DeviceStock[]>(
      'SELECT * FROM device_stocks WHERE id = ?',
      [id]
    );

    if (devices.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const device = devices[0];
    const stockDifference = total_stock - device.total_stock;

    // Update device stock
    await pool.query(
      `UPDATE device_stocks 
      SET total_stock = ?,
          available_stock = available_stock + ?,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`,
      [total_stock, stockDifference, id]
    );

    // Log activity
    const userId = (req as any).user.userId;
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Updated device stock', 'device', id, 
       JSON.stringify({ name: device.name, old_stock: device.total_stock, new_stock: total_stock })]
    );

    res.json({ message: 'Device stock updated successfully' });

  } catch (error) {
    console.error('Update device stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteDevice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if device has active borrowings
    const [activeBorrowings] = await pool.query<BorrowingItem[]>(
      'SELECT COUNT(*) as count FROM borrowings WHERE device_id = ? AND status = "borrowed"',
      [id]
    );

    if ((activeBorrowings[0] as any).count > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete device with active borrowings' 
      });
    }

    // Get device name before deletion
    const [devices] = await pool.query<DeviceStock[]>(
      'SELECT name FROM device_stocks WHERE id = ?',
      [id]
    );

    if (devices.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    await pool.query('DELETE FROM device_stocks WHERE id = ?', [id]);

    // Log activity
    const userId = (req as any).user.userId;
    await pool.query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId, 'Deleted device', 'device', id, 
       JSON.stringify({ name: devices[0].name })]
    );

    res.json({ message: 'Device deleted successfully' });

  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getBorrowingStats = async (req: Request, res: Response) => {
  try {
    const [stats] = await pool.query<RowDataPacket[]>(`
      SELECT 
        (SELECT COUNT(*) FROM borrowings WHERE status = 'borrowed') as total_borrowed,
        (SELECT COUNT(*) FROM device_stocks) as total_devices,
        (SELECT COUNT(*) FROM borrowings 
         WHERE status = 'borrowed' AND return_date < CURDATE()) as overdue_borrowings,
        (SELECT COUNT(*) FROM borrowings 
         WHERE status = 'borrowed' AND return_date = CURDATE()) as due_today
    `);

    res.json(stats[0]);
  } catch (error) {
    console.error('Get borrowing stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};