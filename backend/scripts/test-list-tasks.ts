import * as courseService from '../src/services/course.service.js';

async function main() {
  try {
    const tasks = await courseService.listTasks(['admin'], {});
    console.log('listTasks OK, count:', tasks.length);
    if (tasks[0]) console.log('sample:', tasks[0].title, tasks[0].course?.name);
  } catch (e) {
    console.error('listTasks FAILED:', e instanceof Error ? e.message : e);
  }
}

main();
