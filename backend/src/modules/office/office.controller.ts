/**
 * Core REST API for Khu Văn phòng (`/api/v2/office`):
 * workspace bootstrap (`me`), tasks, assignments, review queue, team progress,
 * attendance check-in/today, and monthly achievement leaderboard.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import {
  OFFICE_APPROVE_TASKS_SCHEMA,
  OFFICE_ASSIGNMENTS_LIST_SCHEMA,
  OFFICE_ASSIGNMENT_SCHEMA,
  OFFICE_ATTENDANCE_CHECKIN_SCHEMA,
  OFFICE_ATTENDANCE_TODAY_SCHEMA,
  OFFICE_DELETE_ASSIGNMENT_SCHEMA,
  OFFICE_LEADERBOARD_SCHEMA,
  OFFICE_ME_SCHEMA,
  OFFICE_MY_TASKS_SCHEMA,
  OFFICE_PROGRESS_SCHEMA,
  OFFICE_REVIEW_LIST_SCHEMA,
  OFFICE_TASK_SCHEMA,
  approveTasksBodySchema,
  createAssignmentBodySchema,
  officePeriodQuerySchema,
  officeUuidParamSchema,
  returnTaskBodySchema,
  submitTaskBodySchema,
  updateAssignmentBodySchema,
  type ApproveTasksBody,
  type CreateAssignmentBody,
  type OfficePeriodQuery,
  type ReturnTaskBody,
  type SubmitTaskBody,
  type UpdateAssignmentBody,
} from './office.schemas.js';
import { OfficeHub } from './realtime/office.hub.js';
import { OfficeAccessService } from './services/office-access.service.js';
import { OfficeAttendanceService } from './services/office-attendance.service.js';
import { OfficeCronService } from './services/office-cron.service.js';
import { OfficeTasksService } from './services/office-tasks.service.js';

@ApiTags('Văn phòng')
@ApiBearerAuth()
@Controller('api/v2/office')
export class OfficeController {
  constructor(
    private readonly access: OfficeAccessService,
    private readonly tasks: OfficeTasksService,
    private readonly attendance: OfficeAttendanceService,
    private readonly hub: OfficeHub,
    private readonly cron: OfficeCronService,
  ) {}

  @Get('me')
  @ApiOperation({
    operationId: 'officeMe',
    summary: 'Thông tin nhóm văn phòng, vai trò, danh sách thành viên và số liệu thẻ HUD',
  })
  @ApiOkResponse({ schema: OFFICE_ME_SCHEMA })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.access.getMeSummary(
      user,
      (teamId) => this.hub.onlineUserIds(teamId),
      undefined,
      async (teamId, at) => {
        await this.cron.ensureDailyRepeatsForTeam(teamId, at);
      },
    );
  }

  // ───────────── Staff tasks & Boss review actions (static routes BEFORE :id) ─────────────

  @Get('tasks')
  @ApiOperation({
    operationId: 'officeListMyTasks',
    summary:
      'Nhiệm vụ ngày hôm nay, nhiệm vụ tháng và KPI tháng này của nhân viên (không gồm expired)',
  })
  @ApiOkResponse({ schema: OFFICE_MY_TASKS_SCHEMA })
  listMyTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.listMyTasks(user);
  }

  @Post('tasks/approve')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeApproveTasks',
    summary: 'Sếp duyệt một hoặc nhiều nhiệm vụ đang chờ xác nhận và cộng điểm tháng ngay',
  })
  @ApiOkResponse({ schema: OFFICE_APPROVE_TASKS_SCHEMA })
  approveTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: approveTasksBodySchema }) body: ApproveTasksBody,
  ) {
    return this.tasks.approveTasks(user, body);
  }

  @Post('tasks/:id/submit')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeSubmitTask',
    summary: 'Nhân viên gửi nhiệm vụ (todo/returned) sang trạng thái chờ sếp xác nhận',
  })
  @ApiOkResponse({ schema: OFFICE_TASK_SCHEMA })
  submitTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
    @Body({ schema: submitTaskBodySchema }) body: SubmitTaskBody,
  ) {
    return this.tasks.submitTask(user, id, body);
  }

  @Post('tasks/:id/return')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeReturnTask',
    summary: 'Sếp trả lại nhiệm vụ đang chờ xác nhận kèm lý do bắt buộc',
  })
  @ApiOkResponse({ schema: OFFICE_TASK_SCHEMA })
  returnTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
    @Body({ schema: returnTaskBodySchema }) body: ReturnTaskBody,
  ) {
    return this.tasks.returnTask(user, id, body);
  }

  // ───────────── Boss assignments ─────────────

  @Get('assignments')
  @ApiOperation({
    operationId: 'officeListAssignments',
    summary: 'Danh sách các lần giao nhiệm vụ của sếp (mới nhất ở trên)',
  })
  @ApiOkResponse({ schema: OFFICE_ASSIGNMENTS_LIST_SCHEMA })
  listAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.listAssignments(user);
  }

  @Post('assignments')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeCreateAssignment',
    summary: 'Sếp giao nhiệm vụ mới (ngày/tháng/KPI) cho một người, nhiều người hoặc cả nhóm',
  })
  @ApiOkResponse({ schema: OFFICE_ASSIGNMENT_SCHEMA })
  createAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: createAssignmentBodySchema }) body: CreateAssignmentBody,
  ) {
    return this.tasks.createAssignment(user, body);
  }

  @Patch('assignments/:id')
  @ApiOperation({
    operationId: 'officeUpdateAssignment',
    summary: 'Sếp sửa nhóm nhiệm vụ (điểm và hạn chỉ áp dụng cho bản chưa done)',
  })
  @ApiOkResponse({ schema: OFFICE_ASSIGNMENT_SCHEMA })
  updateAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
    @Body({ schema: updateAssignmentBodySchema }) body: UpdateAssignmentBody,
  ) {
    return this.tasks.updateAssignment(user, id, body);
  }

  @Delete('assignments/:id')
  @ApiOperation({
    operationId: 'officeDeleteAssignment',
    summary: 'Sếp xoá các bản chưa done của nhóm nhiệm vụ và dừng lặp hằng ngày',
  })
  @ApiOkResponse({ schema: OFFICE_DELETE_ASSIGNMENT_SCHEMA })
  deleteAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
  ) {
    return this.tasks.deleteAssignment(user, id);
  }

  // ───────────── Boss review & progress ─────────────

  @Get('review')
  @ApiOperation({
    operationId: 'officeListReview',
    summary: 'Danh sách nhiệm vụ chờ xác nhận của nhóm (cũ nhất ở trên)',
  })
  @ApiOkResponse({ schema: OFFICE_REVIEW_LIST_SCHEMA })
  listReview(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.listReview(user);
  }

  @Get('progress')
  @ApiOperation({
    operationId: 'officeProgress',
    summary: 'Bảng tiến độ nhiệm vụ của từng nhân viên, xếp theo điểm tháng giảm dần',
  })
  @ApiOkResponse({ schema: OFFICE_PROGRESS_SCHEMA })
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.getProgress(user);
  }

  // ───────────── Attendance & Leaderboard ─────────────

  @Post('attendance/check-in')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeAttendanceCheckIn',
    summary: 'Nhân viên điểm danh theo giờ máy chủ UTC+7 (<=08:30 đúng giờ, 08:31–12:00 trễ)',
  })
  @ApiOkResponse({ schema: OFFICE_ATTENDANCE_CHECKIN_SCHEMA })
  checkIn(@CurrentUser() user: AuthenticatedUser) {
    return this.attendance.checkIn(user);
  }

  @Get('attendance/today')
  @ApiOperation({
    operationId: 'officeAttendanceToday',
    summary: 'Thống kê và danh sách điểm danh hôm nay của nhóm (đúng giờ, trễ, vắng)',
  })
  @ApiOkResponse({ schema: OFFICE_ATTENDANCE_TODAY_SCHEMA })
  attendanceToday(@CurrentUser() user: AuthenticatedUser) {
    return this.attendance.today(user);
  }

  @Get('leaderboard')
  @ApiOperation({
    operationId: 'officeLeaderboard',
    summary:
      'Standee thành tích tháng: Top 3 (>0 điểm, tie-break reached_at sớm nhất) và hạng cá nhân',
  })
  @ApiOkResponse({ schema: OFFICE_LEADERBOARD_SCHEMA })
  leaderboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: officePeriodQuerySchema }) query: OfficePeriodQuery,
  ) {
    return this.tasks.getLeaderboard(user, query);
  }
}
