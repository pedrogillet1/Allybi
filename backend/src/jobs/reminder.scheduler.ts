import cron from 'node-cron';
import prisma from '../config/database';
import { triggerReminderNotification } from '../services/securityStubs.service';

/**
 * Check for upcoming reminders and send notifications
 * Runs every hour
 */
export const checkUpcomingReminders = async () => {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Get reminders due in next 24 hours that haven't been notified
    const reminders = await prisma.reminder.findMany({
      where: {
        dueDate: {
          lte: tomorrow,
          gte: now,
        },
        isCompleted: false,
        notified: false,
      },
    });

    console.log(`Checking reminders: Found ${reminders.length} reminders to notify`);

    for (const reminder of reminders) {
      try {
        await triggerReminderNotification(reminder.userId, reminder.title);
        console.log(`✅ Reminder notification sent for: ${reminder.title}`);
      } catch (error) {
        console.error(`❌ Failed to send reminder notification for ${reminder.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error checking reminders:', error);
  }
};

/**
 * Initialize reminder scheduler
 * Runs every hour at minute 0
 */
export const startReminderScheduler = () => {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('🔔 Running scheduled reminder check...');
    await checkUpcomingReminders();
  });

  console.log('✅ Reminder scheduler started (runs every hour)');
};

/**
 * Check for overdue reminders (for cleanup or warnings)
 */
export const checkOverdueReminders = async () => {
  try {
    const now = new Date();

    const overdueReminders = await prisma.reminder.findMany({
      where: {
        dueDate: {
          lt: now,
        },
        isCompleted: false,
      },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
          },
        },
      },
    });

    console.log(`Found ${overdueReminders.length} overdue reminders`);

    // You could send notifications or cleanup here
    // For now, just log them
    for (const reminder of overdueReminders) {
      console.log(`⚠️  Overdue reminder: ${reminder.title} (User: ${reminder.user.email})`);
    }
  } catch (error) {
    console.error('Error checking overdue reminders:', error);
  }
};
