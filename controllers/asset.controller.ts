import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface Asset extends RowDataPacket {
  id: number;
  name: string;
  type: string;
  category: string;
  status: string;
  value: number;
  assigned_to: number | null;
  location: string;
  purchase_date: string;
  last_maintenance: string | null;
  description: string;
  tags: string[];
  asset_number: string;
  serial_number: string;
  model: string;
  computer_name: string;
  owner_name: string;
  owner_department: string;
  distribution_status: string;
  notes: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export const getAllAssets = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      status, 
      distribution_status,
      search,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT a.*, 
        u.name as assigned_to_name,
        creator.name as created_by_name
      FROM assets a 
      LEFT JOIN users u ON a.assigned_to = u.id
      LEFT JOIN users creator ON a.created_by = creator.id
      WHERE 1=1
    `;
    
    const params: any[] = [];

    if (category) {
      query += ' AND a.category = ?';
      params.push(category);
    }

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (distribution_status) {
      query += ' AND a.distribution_status = ?';
      params.push(distribution_status);
    }

    if (search) {
      query += ' AND (a.name LIKE ? OR a.description LIKE ? OR a.asset_number LIKE ? OR a.serial_number LIKE ? OR a.computer_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Validate sort column to prevent SQL injection
    const validSortColumns = ['name', 'created_at', 'updated_at', 'purchase_date', 'value', 'asset_number'];
    const sortColumn = validSortColumns.includes(sortBy as string) ? sortBy : 'created_at';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY a.${sortColumn} ${order} LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);

    const [assets] = await pool.query<Asset[]>(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM assets WHERE 1=1';
    const countParams: any[] = [];

    if (category) {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (distribution_status) {
      countQuery += ' AND distribution_status = ?';
      countParams.push(distribution_status);
    }

    if (search) {
      countQuery += ' AND (name LIKE ? OR description LIKE ? OR asset_number LIKE ? OR serial_number LIKE ? OR computer_name LIKE ?)';
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const [countResult] = await pool.query<RowDataPacket[]>(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      assets,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAssetById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [assets] = await pool.query<Asset[]>(
      `SELECT a.*, 
        u.name as assigned_to_name, 
        creator.name as created_by_name
       FROM assets a 
       LEFT JOIN users u ON a.assigned_to = u.id
       LEFT JOIN users creator ON a.created_by = creator.id
       WHERE a.id = ?`,
      [id]
    );

    if (assets.length === 0) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    // Parse tags from string to array if needed
    const asset = assets[0];
    if (typeof asset.tags === 'string') {
      try {
        asset.tags = JSON.parse(asset.tags);
      } catch (e) {
        asset.tags = [];
      }
    }

    res.json(asset);
  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createAsset = async (req: Request, res: Response) => {
  console.log('🟢 CREATE ASSET REQUEST RECEIVED');
  console.log('📦 Request Body:', req.body);
  console.log('👤 User:', (req as any).user);

  try {
    const {
      name,
      asset_name,
      asset_number,
      serial_number,
      model,
      computer_name,
      owner_name,
      owner_department,
      distribution_status = 'available',
      notes,
      type = 'other',
      category = 'general',
      status = 'active',
      value = 0.00,
      assigned_to,
      location,
      purchase_date,
      last_maintenance,
      description,
      tags = [],
      file_path,
      file_size,
      mime_type
    } = req.body;

    const userId = (req as any).user?.userId || (req as any).user?.id || 1;
    console.log(`👤 Using User ID: ${userId}`);

    // Validate required fields
    if (!name && !asset_name) {
      console.log('❌ Validation failed: No name provided');
      return res.status(400).json({ 
        success: false,
        message: 'Asset name is required. Please provide either "name" or "asset_name" field.' 
      });
    }

    if (!category) {
      console.log('❌ Validation failed: No category provided');
      return res.status(400).json({ 
        success: false,
        message: 'Category is required' 
      });
    }

    // Use asset_name if name is not provided (for backward compatibility)
    const finalName = name || asset_name;
    console.log(`📝 Final asset name: ${finalName}`);

    console.log('📊 Preparing SQL query...');
    const sql = `INSERT INTO assets 
      (name, type, category, status, value, assigned_to, location, 
       purchase_date, last_maintenance, description, tags, created_by,
       asset_number, serial_number, model, computer_name,
       owner_name, owner_department, distribution_status, notes,
       file_path, file_size, mime_type) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      finalName,
      type,
      category,
      status,
      value,
      assigned_to || null,
      location || null,
      purchase_date || null,
      last_maintenance || null,
      description || null,
      JSON.stringify(tags),
      userId,
      asset_number || null,
      serial_number || null,
      model || null,
      computer_name || null,
      owner_name || null,
      owner_department || null,
      distribution_status,
      notes || null,
      file_path || null,
      file_size || null,
      mime_type || null
    ];

    console.log('📋 SQL Values:', values);
    console.log('🚀 Executing SQL query...');

    const [result] = await pool.query<ResultSetHeader>(sql, values);
    const assetId = result.insertId;
    
    console.log(`✅ Asset inserted successfully! ID: ${assetId}`);
    console.log(`📊 Result:`, result);

    // Log activity (try-catch to prevent activity log failure from breaking response)
    try {
      console.log('📝 Logging activity...');
      await pool.query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId, 
          'Created new asset', 
          'asset', 
          assetId, 
          JSON.stringify({ 
            name: finalName, 
            asset_number,
            category,
            type 
          })
        ]
      );
      console.log('✅ Activity logged successfully');
    } catch (logError: any) {
      console.warn('⚠️ Activity log failed (non-critical):', logError.message);
      console.warn('⚠️ Log error details:', logError);
      // Continue even if activity log fails - don't break the response
    }

    // Return SUCCESS response
    console.log('📤 Sending success response...');
    return res.status(201).json({
      success: true,
      message: 'Asset created successfully',
      assetId: assetId,
      data: {
        id: assetId,
        name: finalName,
        asset_number,
        serial_number,
        category,
        type,
        status,
        distribution_status,
        created_by: userId,
        created_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ CREATE ASSET ERROR:');
    console.error('🔴 Error Message:', error.message);
    console.error('🔴 Error Code:', error.code);
    console.error('🔴 SQL Message:', error.sqlMessage);
    console.error('🔴 SQL:', error.sql);
    console.error('🔴 Stack:', error.stack);
    
    // Handle specific errors
    if (error.code === 'ER_DUP_ENTRY') {
      console.error('🔴 Duplicate entry error');
      return res.status(400).json({ 
        success: false,
        message: 'Asset number already exists. Please use a unique asset number.' 
      });
    }

    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      console.error('🔴 Foreign key constraint error');
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user reference. Please check assigned_to or created_by user.' 
      });
    }

    // Return generic error
    console.error('🔴 Returning generic error response');
    return res.status(500).json({ 
      success: false,
      message: 'Failed to create asset',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage
      } : undefined
    });
  }
};
export const updateAsset = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    // Check if asset exists
    const [existingAssets] = await pool.query<Asset[]>(
      'SELECT * FROM assets WHERE id = ?',
      [id]
    );

    if (existingAssets.length === 0) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    // If asset_name is provided, rename it to name for backward compatibility
    if (updates.asset_name) {
      updates.name = updates.asset_name;
      delete updates.asset_name;
    }

    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.created_at;
    delete updates.updated_at;
    delete updates.created_by;

    // Build dynamic update query
    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => {
      if (field === 'tags') {
        return JSON.stringify(updates[field] || []);
      }
      return updates[field];
    });

    // Add updated_at timestamp
    const finalSetClause = `${setClause}, updated_at = CURRENT_TIMESTAMP`;
    
    await pool.query(
      `UPDATE assets SET ${finalSetClause} WHERE id = ?`,
      [...values, id]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId, 
        'Updated asset', 
        'asset', 
        id, 
        JSON.stringify({
          updated_fields: fields,
          asset_name: updates.name || existingAssets[0].name
        })
      ]
    );

    res.json({ 
      message: 'Asset updated successfully',
      updatedFields: fields 
    });
  } catch (error: any) {
    console.error('Update asset error:', error);
    
    // Handle duplicate asset number
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        message: 'Asset number already exists. Please use a unique asset number.' 
      });
    }

    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
};

export const deleteAsset = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    // Get asset details before deletion
    const [assets] = await pool.query<Asset[]>(
      'SELECT name, asset_number FROM assets WHERE id = ?',
      [id]
    );

    if (assets.length === 0) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    const assetName = assets[0].name;
    const assetNumber = assets[0].asset_number;

    await pool.query('DELETE FROM assets WHERE id = ?', [id]);

    // Log activity
    await pool.query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId, 
        'Deleted asset', 
        'asset', 
        id, 
        JSON.stringify({ 
          name: assetName, 
          asset_number: assetNumber 
        })
      ]
    );

    res.json({ 
      message: 'Asset deleted successfully',
      deletedAsset: { id, name: assetName, asset_number: assetNumber }
    });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAssetStats = async (req: Request, res: Response) => {
  try {
    const [stats] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance,
        SUM(CASE WHEN status = 'retired' THEN 1 ELSE 0 END) as retired,
        SUM(CASE WHEN status = 'disposed' THEN 1 ELSE 0 END) as disposed,
        SUM(CASE WHEN distribution_status = 'available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN distribution_status = 'assigned' THEN 1 ELSE 0 END) as assigned,
        SUM(CASE WHEN distribution_status = 'reserved' THEN 1 ELSE 0 END) as reserved,
        SUM(CASE WHEN distribution_status = 'in_repair' THEN 1 ELSE 0 END) as in_repair,
        SUM(CASE WHEN distribution_status = 'lost' THEN 1 ELSE 0 END) as lost,
        SUM(CASE WHEN distribution_status = 'damaged' THEN 1 ELSE 0 END) as damaged,
        SUM(value) as total_value,
        COUNT(DISTINCT category) as categories,
        COUNT(DISTINCT type) as types
      FROM assets
    `);

    res.json(stats[0]);
  } catch (error) {
    console.error('Get asset stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const searchAssets = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchTerm = `%${q}%`;
    
    const [assets] = await pool.query<Asset[]>(
      `SELECT id, name, asset_number, serial_number, category, status, 
              location, assigned_to, distribution_status
       FROM assets 
       WHERE name LIKE ? 
          OR asset_number LIKE ? 
          OR serial_number LIKE ? 
          OR computer_name LIKE ?
          OR model LIKE ?
          OR owner_name LIKE ?
       LIMIT 20`,
      [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    res.json({ assets });
  } catch (error) {
    console.error('Search assets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const exportAssets = async (req: Request, res: Response) => {
  try {
    const [assets] = await pool.query<Asset[]>(`
      SELECT 
        a.asset_number,
        a.name,
        a.serial_number,
        a.model,
        a.computer_name,
        a.category,
        a.type,
        a.status,
        a.distribution_status,
        a.value,
        a.location,
        a.purchase_date,
        a.owner_name,
        a.owner_department,
        u.name as assigned_to_name,
        a.description,
        a.notes,
        a.created_at,
        a.updated_at
      FROM assets a
      LEFT JOIN users u ON a.assigned_to = u.id
      ORDER BY a.created_at DESC
    `);

    // Convert to CSV format (simplified)
    const csvHeaders = [
      'Asset Number', 'Name', 'Serial Number', 'Model', 'Computer Name',
      'Category', 'Type', 'Status', 'Distribution Status', 'Value',
      'Location', 'Purchase Date', 'Owner Name', 'Owner Department',
      'Assigned To', 'Description', 'Notes', 'Created At', 'Updated At'
    ].join(',');

    const csvRows = assets.map(asset => [
      asset.asset_number || '',
      asset.name,
      asset.serial_number || '',
      asset.model || '',
      asset.computer_name || '',
      asset.category,
      asset.type,
      asset.status,
      asset.distribution_status,
      asset.value || 0,
      asset.location || '',
      asset.purchase_date || '',
      asset.owner_name || '',
      asset.owner_department || '',
      asset.assigned_to_name || '',
      `"${(asset.description || '').replace(/"/g, '""')}"`,
      `"${(asset.notes || '').replace(/"/g, '""')}"`,
      asset.created_at,
      asset.updated_at || ''
    ].join(','));

    const csvContent = [csvHeaders, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=assets_export.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Export assets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};