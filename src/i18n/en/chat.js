/** English for src/pages/Chat.jsx and src/components/ChatTopbarButton.jsx. */

const members = (n) => `${n} ${Number(n) === 1 ? 'member' : 'members'}`;

export default {
  // Conversation list
  'محادثة': 'Conversation',
  'خاص': 'Direct',
  'الفريق': 'Team',
  'دورة': 'Course',
  '{n} غير مقروءة': '{n} unread',
  'رسائل الفريق والمحادثات الخاصة': 'Team and direct messages',
  'جديدة': 'New',
  'بحث في المحادثات…': 'Search conversations…',
  'بحث في المحادثات': 'Search conversations',
  'لا نتائج للبحث': 'No results',
  'لا توجد محادثات بعد': 'No conversations yet',
  'جرّب كلمة أخرى.': 'Try a different word.',
  'ابدأ محادثة خاصة مع أحد الزملاء.': 'Start a direct message with a colleague.',
  'ابدأ محادثة': 'Start a conversation',
  'صورة': 'Image',
  'لا توجد رسائل بعد': 'No messages yet',
  'غير مقروء': 'Unread',

  // Thread
  'اختر محادثة للبدء': 'Choose a conversation',
  'اختر محادثة من القائمة أو ابدأ محادثة خاصة جديدة مع زميل.':
    'Pick one from the list, or start a new direct message with a colleague.',
  'محادثة جديدة': 'New conversation',
  'رجوع للقائمة': 'Back to list',
  '{n} مشاركون': ({ n }) => members(n),
  'لا توجد رسائل بعد، اكتب أول رسالة.': 'No messages yet. Write the first one.',
  'لم يُشاهد بعد': 'Not seen yet',
  'شوهد من {name}': 'Seen by {name}',
  'شوهد من: {names}': 'Seen by: {names}',
  'جاري تحميل الصورة…': 'Loading image…',

  // Composer
  'إزالة': 'Remove',
  'إرفاق صورة': 'Attach image',
  'اكتب رسالة…': 'Write a message…',
  'نص الرسالة': 'Message text',
  'إرسال': 'Send',

  // New direct message
  'اختر زميلاً لبدء محادثة خاصة.': 'Choose a colleague to start a direct message.',
  'بحث بالاسم أو البريد…': 'Search by name or email…',
  'بحث عن موظف': 'Search employees',
  'لا يوجد موظفون مطابقون': 'No matching employees',

  // Errors
  'تعذّر تحميل المحادثات': "Couldn't load conversations",
  'تعذّر تحميل الرسائل': "Couldn't load messages",
  'تعذّر إرسال الرسالة': "Couldn't send the message",
  'تعذّر تحميل الموظفين': "Couldn't load employees",
  'تعذّر بدء المحادثة': "Couldn't start the conversation",
  'يمكن إرفاق الصور فقط في المحادثات حالياً': 'For now, only images can be attached in chat.',
  'تعذّر رفع الصورة': "Couldn't upload the image",
  'تعذّر فتح الملف': "Couldn't open the file",

  // ChatTopbarButton
  'المحادثات، {count} غير مقروءة': 'Chat, {count} unread',
};
