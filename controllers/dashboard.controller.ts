import { Request, Response } from 'express';
import { RowDataPacket, FieldPacket, ResultSetHeader } from 'mysql2';  // Import types dari mysql2
import db from '../config/database'; // Asumsi db adalah mysql2 Pool/Promise

// Interfaces untuk row results (type safety, hindari 'any')
interface UserStatsRow extends RowDataPacket {
  total: number;
  active: number;
}

interface AssetStatsRow extends RowDataPacket {
  total: number;
  totalValue: number;
}

interface LibraryStatsRow extends RowDataPacket {
  total: number;
}

interface ActiveUsersRow extends RowDataPacket {
  active: number;
}

interface ActivityRow extends RowDataPacket {
  id?: number;
  user_id?: number;
  action?: string;
  created_at?: Date;
  user_name?: string;
  // Tambah field lain sesuai schema
}

interface UserGrowthRow extends RowDataPacket {
  month: string;
  count: number;
}

interface DistributionRow extends RowDataPacket {
  category?: string;  // Optional untuk assetDistribution
  type?: string;      // Optional untuk libraryDistribution
  count: number;      // Required - query GROUP BY selalu return ini
}

interface WeeklyActivityRow extends RowDataPacket {
  week: string;
  downloads: number;
  uploads: number;
}

interface UserActivityRow extends RowDataPacket {
  name: string;
  value: number;
  fill: string;
}

interface ErrorCheckRow extends RowDataPacket {
  error_count: number;
}

interface UserCheckRow extends RowDataPacket {
  total: number;
  inactive: number;
}

interface MaintenanceRow extends RowDataPacket {
  maintenance_needed: number;
}

// Interface untuk response data
interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalAssets: number;
  totalLibraryItems: number;
  totalAssetValue: number;
  systemHealth: number;
}

interface ChartData {
  userGrowth: UserGrowthRow[];
  assetDistribution: DistributionRow[];
  libraryDistribution: DistributionRow[];
  weeklyActivity: WeeklyActivityRow[];
  userActivity: UserActivityRow[];
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(' Fetching dashboard stats...');
    
    // Get total users and active users - FIXED: Destructuring match generic type
    const [userRows]: [UserStatsRow[], FieldPacket[]] = await db.query<UserStatsRow[]>(
      `SELECT 
        COUNT(*) as total, 
        SUM(CASE WHEN LOWER(status) = 'active' THEN 1 ELSE 0 END) as active 
       FROM users`
    );
    if (userRows.length === 0) throw new Error('No user stats returned');
    const userStats: UserStatsRow = userRows[0];

    // Get total assets and total value - FIXED: Destructuring match generic
    const [assetRows]: [AssetStatsRow[], FieldPacket[]] = await db.query<AssetStatsRow[]>(
      `SELECT 
        COUNT(*) as total, 
        COALESCE(SUM(value), 0) as totalValue 
       FROM assets 
       WHERE LOWER(status) = 'active'`
    );
    if (assetRows.length === 0) throw new Error('No asset stats returned');
    const assetStats: AssetStatsRow = assetRows[0];

    // Get total library items - FIXED: Destructuring match generic
    const [libraryRows]: [LibraryStatsRow[], FieldPacket[]] = await db.query<LibraryStatsRow[]>(
      'SELECT COUNT(*) as total FROM library_items'
    );
    if (libraryRows.length === 0) throw new Error('No library stats returned');
    const libraryStats: LibraryStatsRow = libraryRows[0];

    // Get recent active users - FIXED: Destructuring match generic
    const [activeRows]: [ActiveUsersRow[], FieldPacket[]] = await db.query<ActiveUsersRow[]>(
      `SELECT COUNT(DISTINCT user_id) as active 
       FROM activity_log 
       WHERE created_at >= NOW() - INTERVAL 30 MINUTE
         AND user_id IS NOT NULL`
    );
    if (activeRows.length === 0) throw new Error('No active users data returned');
    const activeUsersResult: ActiveUsersRow = activeRows[0];

    // Calculate system health
    const systemHealth = await calculateSystemHealth();

    const responseData: DashboardStats = {
      totalUsers: userStats.total || 0,
      activeUsers: activeUsersResult.active || 0,
      totalAssets: assetStats.total || 0,
      totalLibraryItems: libraryStats.total || 0,
      totalAssetValue: assetStats.totalValue || 0,
      systemHealth
    };

    console.log('Dashboard stats:', responseData);

    res.status(200).json({
      success: true,
      data: responseData
    } as ApiResponse<DashboardStats>);

  } catch (error: any) {
    console.error(' Get dashboard stats error:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      message: error.code === 'ER_NO_SUCH_TABLE' ? 'Database table not found' : 'Server error',
      error: error.message 
    } as ApiResponse);
  }
};

const getActivityLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    console.log(` Fetching activity log with limit: ${limit}`);

    // FIXED: Destructuring match generic type
    const [activityRows]: [ActivityRow[], FieldPacket[]] = await db.query<ActivityRow[]>(
      `SELECT al.*, COALESCE(u.name, 'Unknown User') as user_name 
       FROM activity_log al 
       LEFT JOIN users u ON al.user_id = u.id 
       WHERE al.action IS NOT NULL
       ORDER BY al.created_at DESC 
       LIMIT ?`,
      [limit]
    );

    console.log(` Found ${activityRows.length} activities`);

    res.status(200).json({
      success: true,
      data: activityRows
    } as ApiResponse<ActivityRow[]>);

  } catch (error: any) {
    console.error(' Get activity log error:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      message: error.code === 'ER_NO_SUCH_TABLE' ? 'Database table not found' : 'Server error',
      error: error.message 
    } as ApiResponse);
  }
};

const getChartData = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(' Fetching chart data...');

    // User growth data - FIXED: Destructuring match generic
    const [userGrowthRows]: [UserGrowthRow[], FieldPacket[]] = await db.query<UserGrowthRow[]>(
      `SELECT 
        DATE_FORMAT(created_at, '%b %Y') as month,
        COUNT(*) as count
      FROM users
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY MIN(created_at) ASC`
    );

    // Asset distribution - FIXED: Destructuring match generic (sekarang DistributionRow[] assignable)
    const [assetDistRows]: [DistributionRow[], FieldPacket[]] = await db.query<DistributionRow[]>(
      `SELECT COALESCE(category, 'Unknown') as category, COUNT(*) as count
       FROM assets
       WHERE LOWER(status) = 'active'
       GROUP BY category`
    );

    // Library distribution - FIXED: Destructuring match generic (sekarang DistributionRow[] assignable)
    const [libraryDistRows]: [DistributionRow[], FieldPacket[]] = await db.query<DistributionRow[]>(
      `SELECT COALESCE(type, 'Unknown') as type, COUNT(*) as count
       FROM library_items
       GROUP BY type`
    );

    // Weekly activity - FIXED: Destructuring match generic
    const [weeklyRows]: [WeeklyActivityRow[], FieldPacket[]] = await db.query<WeeklyActivityRow[]>(
      `SELECT 
        CONCAT('Week ', ROW_NUMBER() OVER (ORDER BY MIN(created_at) ASC)) as week,
        COALESCE(COUNT(CASE WHEN action LIKE '%download%' THEN 1 END), 0) as downloads,
        COALESCE(COUNT(CASE WHEN action LIKE '%upload%' OR action LIKE '%create%' THEN 1 END), 0) as uploads
      FROM activity_log 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 4 WEEK)
        AND action IS NOT NULL
        AND (action LIKE '%download%' OR action LIKE '%upload%' OR action LIKE '%create%')
      GROUP BY WEEK(created_at, 1)
      ORDER BY MIN(created_at) ASC`
    );

    // User activity status - FIXED: Destructuring match generic
    const [userActivityRows]: [UserActivityRow[], FieldPacket[]] = await db.query<UserActivityRow[]>(
      `SELECT 
        COALESCE(status, 'Unknown') as name,
        COUNT(*) as value,
        CASE 
          WHEN LOWER(COALESCE(status, '')) = 'active' THEN '#3b82f6'
          WHEN LOWER(COALESCE(status, '')) = 'inactive' THEN '#ef4444'
          ELSE '#e5e7eb'
        END as fill
      FROM users 
      GROUP BY status`
    );

    const responseData: ChartData = {
      userGrowth: userGrowthRows,
      assetDistribution: assetDistRows,  // Sekarang typed benar: DistributionRow[]
      libraryDistribution: libraryDistRows,  // Sekarang typed benar: DistributionRow[]
      weeklyActivity: weeklyRows,
      userActivity: userActivityRows
    };

    console.log(' Chart data fetched successfully');

    res.status(200).json({
      success: true,
      data: responseData
    } as ApiResponse<ChartData>);

  } catch (error: any) {
    console.error(' Get chart data error:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      message: error.code === 'ER_NO_SUCH_TABLE' ? 'Database table not found' : 'Server error',
      error: error.message 
    } as ApiResponse);
  }
};

// Helper function - FIXED: Semua destructuring match generic types
const calculateSystemHealth = async (): Promise<number> => {
  try {
    let healthScore = 100;

    // DB connectivity check
    const [dbCheckRows]: [RowDataPacket[], FieldPacket[]] = await db.query<RowDataPacket[]>(
      'SELECT 1 as connected'
    );
    if (!dbCheckRows || dbCheckRows.length === 0) healthScore -= 20;

    // Error check
    const [errorRows]: [ErrorCheckRow[], FieldPacket[]] = await db.query<ErrorCheckRow[]>(
      `SELECT COUNT(*) as error_count 
       FROM activity_log 
       WHERE (action LIKE '%error%' OR action LIKE '%fail%')
         AND created_at >= NOW() - INTERVAL 1 HOUR
         AND action IS NOT NULL`
    );
    if (errorRows.length === 0) return 85; // Fallback jika error query gagal
    const errorCheck: ErrorCheckRow = errorRows[0];
    const errorCount = errorCheck.error_count || 0;
    if (errorCount > 5) healthScore -= Math.min(10, (errorCount / 10) * 10);

    // Inactive users check
    const [userCheckRows]: [UserCheckRow[], FieldPacket[]] = await db.query<UserCheckRow[]>(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN LOWER(status) = 'inactive' THEN 1 ELSE 0 END) as inactive
      FROM users`
    );
    if (userCheckRows.length === 0) return 85;
    const userCheck: UserCheckRow = userCheckRows[0];
    const totalUsers = userCheck.total || 0;
    if (totalUsers > 0) {
      const inactiveCount = userCheck.inactive || 0;
      const inactivePercentage = (inactiveCount / totalUsers) * 100;
      if (inactivePercentage > 30) healthScore -= 15;
    }

    // Maintenance check
    const [maintenanceRows]: [MaintenanceRow[], FieldPacket[]] = await db.query<MaintenanceRow[]>(
      `SELECT COUNT(*) as maintenance_needed
       FROM assets 
       WHERE LOWER(status) = 'maintenance' 
         OR (COALESCE(last_maintenance, '1970-01-01') < DATE_SUB(NOW(), INTERVAL 6 MONTH))`
    );
    if (maintenanceRows.length === 0) return 85;
    const maintenanceCheck: MaintenanceRow = maintenanceRows[0];
    const maintenanceNeeded = maintenanceCheck.maintenance_needed || 0;
    if (maintenanceNeeded > 10) healthScore -= 10;

    const finalScore = Math.max(0, Math.min(100, healthScore));
    console.log(` System health score: ${finalScore} (totalUsers: ${totalUsers}, errors: ${errorCount}, maintenance: ${maintenanceNeeded})`);
    
    return finalScore;

  } catch (error: any) {
    console.error(' System health calculation error:', error.message, error.stack);
    return 85;
  }
};

export { getDashboardStats, getActivityLog, getChartData };