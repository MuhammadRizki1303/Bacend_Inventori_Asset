import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/database';
import { ResultSetHeader } from 'mysql2';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/assets';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|mov|avi|mp3|wav/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, documents, and audio files are allowed.'));
  }
};

export const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: fileFilter
});

export const uploadAssetFiles = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { name, category, tags, description } = req.body;
    const userId = (req as any).user.userId;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    if (!name) {
      return res.status(400).json({ message: 'Asset name is required' });
    }

    // Parse tags if it's a string
    let parsedTags = [];
    if (tags) {
      if (typeof tags === 'string') {
        parsedTags = tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag);
      } else if (Array.isArray(tags)) {
        parsedTags = tags;
      }
    }

    const uploadedAssets = [];

    for (const file of files) {
      // Determine file type based on mimetype
      let fileType = 'document';
      if (file.mimetype.startsWith('image/')) {
        fileType = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        fileType = 'video';
      } else if (file.mimetype.startsWith('audio/')) {
        fileType = 'audio';
      }

      const assetData = {
        name: files.length === 1 ? name : `${name} - ${file.originalname}`,
        type: fileType,
        category: category || fileType,
        status: 'active',
        file_path: file.path,
        file_size: file.size,
        mime_type: file.mimetype,
        description: description || '',
        tags: JSON.stringify(parsedTags),
        location: 'uploads/assets',
        created_by: userId
      };

      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO assets 
        (name, type, category, status, file_path, file_size, mime_type, description, tags, location, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assetData.name,
          assetData.type,
          assetData.category,
          assetData.status,
          assetData.file_path,
          assetData.file_size,
          assetData.mime_type,
          assetData.description,
          assetData.tags,
          assetData.location,
          assetData.created_by
        ]
      );

      // Log activity
      await pool.query(
        'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [userId, 'Uploaded new asset', 'asset', result.insertId, JSON.stringify({ name: assetData.name, type: fileType })]
      );

      uploadedAssets.push({
        id: result.insertId,
        name: assetData.name,
        type: fileType,
        size: file.size,
        path: file.path
      });
    }

    res.status(201).json({
      message: `${files.length} asset(s) uploaded successfully`,
      assets: uploadedAssets
    });
  } catch (error) {
    console.error('Upload asset error:', error);
    res.status(500).json({ message: 'Server error during upload' });
  }
};