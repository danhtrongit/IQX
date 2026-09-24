import type * as T from "./backend-v2"

/** Generated from backend-v2/contracts/openapi-v2.json. */
export interface OperationMap {
  "DELETE /api/v2/admin/alerts/signals/{key}": { request: T.AdminAlertsControllerRemove1Data; response: T.AdminAlertsControllerRemove1Responses[keyof T.AdminAlertsControllerRemove1Responses] }
  "DELETE /api/v2/admin/lessons/courses/{courseId}": { request: T.AdminLearningControllerDeleteCourse1Data; response: T.AdminLearningControllerDeleteCourse1Responses[keyof T.AdminLearningControllerDeleteCourse1Responses] }
  "DELETE /api/v2/admin/lessons/episodes/{episodeId}": { request: T.AdminLearningControllerDeleteEpisode1Data; response: T.AdminLearningControllerDeleteEpisode1Responses[keyof T.AdminLearningControllerDeleteEpisode1Responses] }
  "DELETE /api/v2/alerts/rules/{ruleId}": { request: T.AlertsControllerDeleteRule1Data; response: T.AlertsControllerDeleteRule1Responses[keyof T.AlertsControllerDeleteRule1Responses] }
  "DELETE /api/v2/alerts/telegram": { request: T.AlertsControllerUnlinkTelegram1Data; response: T.AlertsControllerUnlinkTelegram1Responses[keyof T.AlertsControllerUnlinkTelegram1Responses] }
  "DELETE /api/v2/backtest/strategies/{strategyId}": { request: T.QuantControllerDelete0Data; response: T.QuantControllerDelete0Responses[keyof T.QuantControllerDelete0Responses] }
  "DELETE /api/v2/cap5/watchlist/{symbol}": { request: T.Cap5RemoveWatchlistDeleteApiV2Cap5WatchlistSymbolData; response: T.Cap5RemoveWatchlistDeleteApiV2Cap5WatchlistSymbolResponses[keyof T.Cap5RemoveWatchlistDeleteApiV2Cap5WatchlistSymbolResponses] }
  "DELETE /api/v2/chart-drawings/{symbol}": { request: T.DeleteChartDrawingV2Data; response: T.DeleteChartDrawingV2Responses[keyof T.DeleteChartDrawingV2Responses] }
  "DELETE /api/v2/premium/admin/plans/{plan_id}": { request: T.AdminDeletePremiumPlanDeleteApiV2PremiumAdminPlansPlanIdData; response: T.AdminDeletePremiumPlanDeleteApiV2PremiumAdminPlansPlanIdResponses[keyof T.AdminDeletePremiumPlanDeleteApiV2PremiumAdminPlansPlanIdResponses] }
  "DELETE /api/v2/users/{userId}": { request: T.UsersControllerRemove1Data; response: T.UsersControllerRemove1Responses[keyof T.UsersControllerRemove1Responses] }
  "DELETE /api/v2/watchlists/{symbol}": { request: T.RemoveWatchlistItemV2Data; response: T.RemoveWatchlistItemV2Responses[keyof T.RemoveWatchlistItemV2Responses] }
  "GET /api/v2/admin/alerts/factor-library": { request: T.AdminAlertsControllerFactorLibrary1Data; response: T.AdminAlertsControllerFactorLibrary1Responses[keyof T.AdminAlertsControllerFactorLibrary1Responses] }
  "GET /api/v2/admin/alerts/indicators": { request: T.AdminAlertsControllerIndicators1Data; response: T.AdminAlertsControllerIndicators1Responses[keyof T.AdminAlertsControllerIndicators1Responses] }
  "GET /api/v2/admin/alerts/signals": { request: T.AdminAlertsControllerSignals1Data; response: T.AdminAlertsControllerSignals1Responses[keyof T.AdminAlertsControllerSignals1Responses] }
  "GET /api/v2/admin/audit": { request: T.AdminAuditControllerList1Data; response: T.AdminAuditControllerList1Responses[keyof T.AdminAuditControllerList1Responses] }
  "GET /api/v2/admin/audit/export": { request: T.AdminAuditControllerExport1Data; response: T.AdminAuditControllerExport1Responses[keyof T.AdminAuditControllerExport1Responses] }
  "GET /api/v2/admin/ipn": { request: T.AdminListIpnLogsGetApiV2AdminIpnData; response: T.AdminListIpnLogsGetApiV2AdminIpnResponses[keyof T.AdminListIpnLogsGetApiV2AdminIpnResponses] }
  "GET /api/v2/admin/ipn/{log_id}": { request: T.AdminGetIpnLogGetApiV2AdminIpnLogIdData; response: T.AdminGetIpnLogGetApiV2AdminIpnLogIdResponses[keyof T.AdminGetIpnLogGetApiV2AdminIpnLogIdResponses] }
  "GET /api/v2/admin/lessons/courses": { request: T.AdminLearningControllerCourses1Data; response: T.AdminLearningControllerCourses1Responses[keyof T.AdminLearningControllerCourses1Responses] }
  "GET /api/v2/admin/lessons/courses/{courseId}": { request: T.AdminLearningControllerCourse1Data; response: T.AdminLearningControllerCourse1Responses[keyof T.AdminLearningControllerCourse1Responses] }
  "GET /api/v2/admin/metrics/overview": { request: T.AdminMetricsControllerOverview1Data; response: T.AdminMetricsControllerOverview1Responses[keyof T.AdminMetricsControllerOverview1Responses] }
  "GET /api/v2/admin/metrics/plan-distribution": { request: T.AdminMetricsControllerPlanDistribution1Data; response: T.AdminMetricsControllerPlanDistribution1Responses[keyof T.AdminMetricsControllerPlanDistribution1Responses] }
  "GET /api/v2/admin/metrics/revenue": { request: T.AdminMetricsControllerRevenue1Data; response: T.AdminMetricsControllerRevenue1Responses[keyof T.AdminMetricsControllerRevenue1Responses] }
  "GET /api/v2/admin/payments": { request: T.AdminListPaymentsGetApiV2AdminPaymentsData; response: T.AdminListPaymentsGetApiV2AdminPaymentsResponses[keyof T.AdminListPaymentsGetApiV2AdminPaymentsResponses] }
  "GET /api/v2/admin/payments/{order_id}": { request: T.AdminGetPaymentGetApiV2AdminPaymentsOrderIdData; response: T.AdminGetPaymentGetApiV2AdminPaymentsOrderIdResponses[keyof T.AdminGetPaymentGetApiV2AdminPaymentsOrderIdResponses] }
  "GET /api/v2/admin/subscriptions": { request: T.AdminListSubscriptionsGetApiV2AdminSubscriptionsData; response: T.AdminListSubscriptionsGetApiV2AdminSubscriptionsResponses[keyof T.AdminListSubscriptionsGetApiV2AdminSubscriptionsResponses] }
  "GET /api/v2/admin/subscriptions/{sub_id}": { request: T.AdminGetSubscriptionGetApiV2AdminSubscriptionsSubIdData; response: T.AdminGetSubscriptionGetApiV2AdminSubscriptionsSubIdResponses[keyof T.AdminGetSubscriptionGetApiV2AdminSubscriptionsSubIdResponses] }
  "GET /api/v2/admin/system/status": { request: T.AdminSystemControllerStatus1Data; response: T.AdminSystemControllerStatus1Responses[keyof T.AdminSystemControllerStatus1Responses] }
  "GET /api/v2/admin/users/{user_id}/subscriptions/history": { request: T.AdminGetSubscriptionHistoryGetApiV2AdminUsersUserIdSubscriptionsHistoryData; response: T.AdminGetSubscriptionHistoryGetApiV2AdminUsersUserIdSubscriptionsHistoryResponses[keyof T.AdminGetSubscriptionHistoryGetApiV2AdminUsersUserIdSubscriptionsHistoryResponses] }
  "GET /api/v2/admin/users/{userId}/360": { request: T.AdminUsersControllerGet3601Data; response: T.AdminUsersControllerGet3601Responses[keyof T.AdminUsersControllerGet3601Responses] }
  "GET /api/v2/admin/users/{userId}/login-history": { request: T.AdminUsersControllerLoginHistory1Data; response: T.AdminUsersControllerLoginHistory1Responses[keyof T.AdminUsersControllerLoginHistory1Responses] }
  "GET /api/v2/admin/users/export": { request: T.AdminUsersControllerExport1Data; response: T.AdminUsersControllerExport1Responses[keyof T.AdminUsersControllerExport1Responses] }
  "GET /api/v2/admin/vt/accounts": { request: T.AdminVtControllerAccounts1Data; response: T.AdminVtControllerAccounts1Responses[keyof T.AdminVtControllerAccounts1Responses] }
  "GET /api/v2/admin/vt/accounts/{accountId}": { request: T.AdminVtControllerAccount1Data; response: T.AdminVtControllerAccount1Responses[keyof T.AdminVtControllerAccount1Responses] }
  "GET /api/v2/admin/vt/accounts/{accountId}/ledger": { request: T.AdminVtControllerLedger1Data; response: T.AdminVtControllerLedger1Responses[keyof T.AdminVtControllerLedger1Responses] }
  "GET /api/v2/admin/vt/accounts/{accountId}/orders": { request: T.AdminVtControllerOrders1Data; response: T.AdminVtControllerOrders1Responses[keyof T.AdminVtControllerOrders1Responses] }
  "GET /api/v2/admin/vt/accounts/{accountId}/positions": { request: T.AdminVtControllerPositions1Data; response: T.AdminVtControllerPositions1Responses[keyof T.AdminVtControllerPositions1Responses] }
  "GET /api/v2/admin/vt/accounts/{accountId}/settlements": { request: T.AdminVtControllerSettlements1Data; response: T.AdminVtControllerSettlements1Responses[keyof T.AdminVtControllerSettlements1Responses] }
  "GET /api/v2/admin/vt/accounts/{accountId}/stats": { request: T.AdminVtControllerStats1Data; response: T.AdminVtControllerStats1Responses[keyof T.AdminVtControllerStats1Responses] }
  "GET /api/v2/admin/vt/accounts/{accountId}/trades": { request: T.AdminVtControllerTrades1Data; response: T.AdminVtControllerTrades1Responses[keyof T.AdminVtControllerTrades1Responses] }
  "GET /api/v2/admin/vt/config": { request: T.AdminVtControllerConfig1Data; response: T.AdminVtControllerConfig1Responses[keyof T.AdminVtControllerConfig1Responses] }
  "GET /api/v2/ai/bctc-dashboard/{symbol}": { request: T.GetBctcNarrativeV2GetApiV2AiBctcDashboardSymbolData; response: T.GetBctcNarrativeV2GetApiV2AiBctcDashboardSymbolResponses[keyof T.GetBctcNarrativeV2GetApiV2AiBctcDashboardSymbolResponses] }
  "GET /api/v2/ai/bctc/{symbol}": { request: T.GetBctcAnalysisV2GetApiV2AiBctcSymbolData; response: T.GetBctcAnalysisV2GetApiV2AiBctcSymbolResponses[keyof T.GetBctcAnalysisV2GetApiV2AiBctcSymbolResponses] }
  "GET /api/v2/ai/forecast/ranking": { request: T.GetForecastRankingV2GetApiV2AiForecastRankingData; response: T.GetForecastRankingV2GetApiV2AiForecastRankingResponses[keyof T.GetForecastRankingV2GetApiV2AiForecastRankingResponses] }
  "GET /api/v2/ai/forecast/symbols/{symbol}": { request: T.GetForecastForSymbolV2GetApiV2AiForecastSymbolsSymbolData; response: T.GetForecastForSymbolV2GetApiV2AiForecastSymbolsSymbolResponses[keyof T.GetForecastForSymbolV2GetApiV2AiForecastSymbolsSymbolResponses] }
  "GET /api/v2/ai/insight/{symbol}": { request: T.GetInsightV2GetApiV2AiInsightSymbolData; response: T.GetInsightV2GetApiV2AiInsightSymbolResponses[keyof T.GetInsightV2GetApiV2AiInsightSymbolResponses] }
  "GET /api/v2/ai/patterns/{kind}/symbols": { request: T.ListPatternSymbolsV2GetApiV2AiPatternsKindSymbolsData; response: T.ListPatternSymbolsV2GetApiV2AiPatternsKindSymbolsResponses[keyof T.ListPatternSymbolsV2GetApiV2AiPatternsKindSymbolsResponses] }
  "GET /api/v2/ai/patterns/candles": { request: T.GetCandlePatternsV2GetApiV2AiPatternsCandlesData; response: T.GetCandlePatternsV2GetApiV2AiPatternsCandlesResponses[keyof T.GetCandlePatternsV2GetApiV2AiPatternsCandlesResponses] }
  "GET /api/v2/ai/patterns/charts": { request: T.GetChartPatternsV2GetApiV2AiPatternsChartsData; response: T.GetChartPatternsV2GetApiV2AiPatternsChartsResponses[keyof T.GetChartPatternsV2GetApiV2AiPatternsChartsResponses] }
  "GET /api/v2/alerts/events": { request: T.AlertsControllerListEvents1Data; response: T.AlertsControllerListEvents1Responses[keyof T.AlertsControllerListEvents1Responses] }
  "GET /api/v2/alerts/rules": { request: T.AlertsControllerListRules1Data; response: T.AlertsControllerListRules1Responses[keyof T.AlertsControllerListRules1Responses] }
  "GET /api/v2/alerts/signals": { request: T.AlertsControllerListSignals1Data; response: T.AlertsControllerListSignals1Responses[keyof T.AlertsControllerListSignals1Responses] }
  "GET /api/v2/alerts/telegram": { request: T.AlertsControllerTelegramStatus1Data; response: T.AlertsControllerTelegramStatus1Responses[keyof T.AlertsControllerTelegramStatus1Responses] }
  "GET /api/v2/auth/me": { request: T.AuthControllerMe1Data; response: T.AuthControllerMe1Responses[keyof T.AuthControllerMe1Responses] }
  "GET /api/v2/auth/reset-password": { request: T.AuthControllerResetPasswordForm1Data; response: T.AuthControllerResetPasswordForm1Responses[keyof T.AuthControllerResetPasswordForm1Responses] }
  "GET /api/v2/auth/verify-email": { request: T.AuthControllerVerifyEmail1Data; response: T.AuthControllerVerifyEmail1Responses[keyof T.AuthControllerVerifyEmail1Responses] }
  "GET /api/v2/backtest/catalog": { request: T.QuantControllerCatalog0Data; response: T.QuantControllerCatalog0Responses[keyof T.QuantControllerCatalog0Responses] }
  "GET /api/v2/backtest/strategies": { request: T.QuantControllerList0Data; response: T.QuantControllerList0Responses[keyof T.QuantControllerList0Responses] }
  "GET /api/v2/bot": { request: T.GetBotOverviewGetApiV2BotData; response: T.GetBotOverviewGetApiV2BotResponses[keyof T.GetBotOverviewGetApiV2BotResponses] }
  "GET /api/v2/bot/journal": { request: T.GetBotJournalGetApiV2BotJournalData; response: T.GetBotJournalGetApiV2BotJournalResponses[keyof T.GetBotJournalGetApiV2BotJournalResponses] }
  "GET /api/v2/bot/mascot": { request: T.JourneyIdentityControllerGetMascot1Data; response: T.JourneyIdentityControllerGetMascot1Responses[keyof T.JourneyIdentityControllerGetMascot1Responses] }
  "GET /api/v2/bot/performance": { request: T.GetBotPerformanceGetApiV2BotPerformanceData; response: T.GetBotPerformanceGetApiV2BotPerformanceResponses[keyof T.GetBotPerformanceGetApiV2BotPerformanceResponses] }
  "GET /api/v2/bot/positions": { request: T.GetBotPositionsGetApiV2BotPositionsData; response: T.GetBotPositionsGetApiV2BotPositionsResponses[keyof T.GetBotPositionsGetApiV2BotPositionsResponses] }
  "GET /api/v2/bot/status": { request: T.GetBotStatusGetApiV2BotStatusData; response: T.GetBotStatusGetApiV2BotStatusResponses[keyof T.GetBotStatusGetApiV2BotStatusResponses] }
  "GET /api/v2/cap0/kehoach": { request: T.Cap0ControllerGetKehoach1Data; response: T.Cap0ControllerGetKehoach1Responses[keyof T.Cap0ControllerGetKehoach1Responses] }
  "GET /api/v2/cap0/placement": { request: T.Cap0ControllerGetPlacement1Data; response: T.Cap0ControllerGetPlacement1Responses[keyof T.Cap0ControllerGetPlacement1Responses] }
  "GET /api/v2/cap0/progress": { request: T.Cap0ControllerProgress1Data; response: T.Cap0ControllerProgress1Responses[keyof T.Cap0ControllerProgress1Responses] }
  "GET /api/v2/cap1/progress": { request: T.Cap1ControllerProgress1Data; response: T.Cap1ControllerProgress1Responses[keyof T.Cap1ControllerProgress1Responses] }
  "GET /api/v2/cap1/trades": { request: T.Cap1ControllerTrades1Data; response: T.Cap1ControllerTrades1Responses[keyof T.Cap1ControllerTrades1Responses] }
  "GET /api/v2/cap2/alerts/active": { request: T.Cap2ControllerActive1Data; response: T.Cap2ControllerActive1Responses[keyof T.Cap2ControllerActive1Responses] }
  "GET /api/v2/cap2/analysis": { request: T.Cap2ControllerAnalysis1Data; response: T.Cap2ControllerAnalysis1Responses[keyof T.Cap2ControllerAnalysis1Responses] }
  "GET /api/v2/cap2/diem-ky-luat": { request: T.Cap2ControllerScore1Data; response: T.Cap2ControllerScore1Responses[keyof T.Cap2ControllerScore1Responses] }
  "GET /api/v2/cap2/diem-ky-luat/history": { request: T.Cap2ControllerHistory1Data; response: T.Cap2ControllerHistory1Responses[keyof T.Cap2ControllerHistory1Responses] }
  "GET /api/v2/cap2/progress": { request: T.Cap2ControllerProgress1Data; response: T.Cap2ControllerProgress1Responses[keyof T.Cap2ControllerProgress1Responses] }
  "GET /api/v2/cap2/trades": { request: T.Cap2ControllerTrades1Data; response: T.Cap2ControllerTrades1Responses[keyof T.Cap2ControllerTrades1Responses] }
  "GET /api/v2/cap3/plans/{order_id}": { request: T.Cap3ControllerGetPlan1Data; response: T.Cap3ControllerGetPlan1Responses[keyof T.Cap3ControllerGetPlan1Responses] }
  "GET /api/v2/cap3/progress": { request: T.Cap3ControllerProgress1Data; response: T.Cap3ControllerProgress1Responses[keyof T.Cap3ControllerProgress1Responses] }
  "GET /api/v2/cap3/trades": { request: T.Cap3ControllerTrades1Data; response: T.Cap3ControllerTrades1Responses[keyof T.Cap3ControllerTrades1Responses] }
  "GET /api/v2/cap3/trades/analysis": { request: T.Cap3ControllerTradeAnalysis1Data; response: T.Cap3ControllerTradeAnalysis1Responses[keyof T.Cap3ControllerTradeAnalysis1Responses] }
  "GET /api/v2/cap4/phan-tich": { request: T.Cap4ControllerAnalysis1Data; response: T.Cap4ControllerAnalysis1Responses[keyof T.Cap4ControllerAnalysis1Responses] }
  "GET /api/v2/cap4/plans/{order_id}": { request: T.Cap4ControllerGetPlan1Data; response: T.Cap4ControllerGetPlan1Responses[keyof T.Cap4ControllerGetPlan1Responses] }
  "GET /api/v2/cap4/progress": { request: T.Cap4ControllerProgress1Data; response: T.Cap4ControllerProgress1Responses[keyof T.Cap4ControllerProgress1Responses] }
  "GET /api/v2/cap4/vu-khi-diem-mu": { request: T.Cap4ControllerWeapons1Data; response: T.Cap4ControllerWeapons1Responses[keyof T.Cap4ControllerWeapons1Responses] }
  "GET /api/v2/cap5/nguon-san/{symbol}": { request: T.Cap5HuntSourceGetApiV2Cap5NguonSanSymbolData; response: T.Cap5HuntSourceGetApiV2Cap5NguonSanSymbolResponses[keyof T.Cap5HuntSourceGetApiV2Cap5NguonSanSymbolResponses] }
  "GET /api/v2/cap5/phan-tich": { request: T.Cap5AnalysisGetApiV2Cap5PhanTichData; response: T.Cap5AnalysisGetApiV2Cap5PhanTichResponses[keyof T.Cap5AnalysisGetApiV2Cap5PhanTichResponses] }
  "GET /api/v2/cap5/plans/{order_id}": { request: T.Cap5PlanGetApiV2Cap5PlansOrderIdData; response: T.Cap5PlanGetApiV2Cap5PlansOrderIdResponses[keyof T.Cap5PlanGetApiV2Cap5PlansOrderIdResponses] }
  "GET /api/v2/cap5/progress": { request: T.Cap5ProgressGetApiV2Cap5ProgressData; response: T.Cap5ProgressGetApiV2Cap5ProgressResponses[keyof T.Cap5ProgressGetApiV2Cap5ProgressResponses] }
  "GET /api/v2/cap5/san-ma": { request: T.Cap5HuntIndexGetApiV2Cap5SanMaData; response: T.Cap5HuntIndexGetApiV2Cap5SanMaResponses[keyof T.Cap5HuntIndexGetApiV2Cap5SanMaResponses] }
  "GET /api/v2/cap5/san-ma/{bo_loc}": { request: T.Cap5HuntResultGetApiV2Cap5SanMaBoLocData; response: T.Cap5HuntResultGetApiV2Cap5SanMaBoLocResponses[keyof T.Cap5HuntResultGetApiV2Cap5SanMaBoLocResponses] }
  "GET /api/v2/cap5/watchlist": { request: T.Cap5WatchlistGetApiV2Cap5WatchlistData; response: T.Cap5WatchlistGetApiV2Cap5WatchlistResponses[keyof T.Cap5WatchlistGetApiV2Cap5WatchlistResponses] }
  "GET /api/v2/cap6/kehoach/{order_id}": { request: T.Cap6GetPlanGetApiV2Cap6KehoachOrderIdData; response: T.Cap6GetPlanGetApiV2Cap6KehoachOrderIdResponses[keyof T.Cap6GetPlanGetApiV2Cap6KehoachOrderIdResponses] }
  "GET /api/v2/cap6/mau-thuan/{symbol}": { request: T.Cap6ConflictGetApiV2Cap6MauThuanSymbolData; response: T.Cap6ConflictGetApiV2Cap6MauThuanSymbolResponses[keyof T.Cap6ConflictGetApiV2Cap6MauThuanSymbolResponses] }
  "GET /api/v2/cap6/phan-tich": { request: T.Cap6AnalysisGetApiV2Cap6PhanTichData; response: T.Cap6AnalysisGetApiV2Cap6PhanTichResponses[keyof T.Cap6AnalysisGetApiV2Cap6PhanTichResponses] }
  "GET /api/v2/cap6/plans/{order_id}": { request: T.Cap6CumulativePlanGetApiV2Cap6PlansOrderIdData; response: T.Cap6CumulativePlanGetApiV2Cap6PlansOrderIdResponses[keyof T.Cap6CumulativePlanGetApiV2Cap6PlansOrderIdResponses] }
  "GET /api/v2/cap6/progress": { request: T.Cap6ProgressGetApiV2Cap6ProgressData; response: T.Cap6ProgressGetApiV2Cap6ProgressResponses[keyof T.Cap6ProgressGetApiV2Cap6ProgressResponses] }
  "GET /api/v2/cap7/portfolio": { request: T.GetCap7PortfolioV2Data; response: T.GetCap7PortfolioV2Responses[keyof T.GetCap7PortfolioV2Responses] }
  "GET /api/v2/cap7/progress": { request: T.GetCap7ProgressV2Data; response: T.GetCap7ProgressV2Responses[keyof T.GetCap7ProgressV2Responses] }
  "GET /api/v2/cap8/positions/{symbol}/exit-context": { request: T.GetCap8ExitContextV2Data; response: T.GetCap8ExitContextV2Responses[keyof T.GetCap8ExitContextV2Responses] }
  "GET /api/v2/cap8/progress": { request: T.GetCap8ProgressV2Data; response: T.GetCap8ProgressV2Responses[keyof T.GetCap8ProgressV2Responses] }
  "GET /api/v2/chart-drawings/{symbol}": { request: T.GetChartDrawingV2Data; response: T.GetChartDrawingV2Responses[keyof T.GetChartDrawingV2Responses] }
  "GET /api/v2/health": { request: T.LegacyHealthGetApiV2HealthData; response: T.LegacyHealthGetApiV2HealthResponses[keyof T.LegacyHealthGetApiV2HealthResponses] }
  "GET /api/v2/instruments": { request: T.SearchInstrumentsV2Data; response: T.SearchInstrumentsV2Responses[keyof T.SearchInstrumentsV2Responses] }
  "GET /api/v2/instruments/{symbol}": { request: T.GetInstrumentV2Data; response: T.GetInstrumentV2Responses[keyof T.GetInstrumentV2Responses] }
  "GET /api/v2/lessons/courses": { request: T.LearningControllerCourses1Data; response: T.LearningControllerCourses1Responses[keyof T.LearningControllerCourses1Responses] }
  "GET /api/v2/lessons/courses/{slug}": { request: T.LearningControllerCourse1Data; response: T.LearningControllerCourse1Responses[keyof T.LearningControllerCourse1Responses] }
  "GET /api/v2/lessons/episodes/{episodeId}/content": { request: T.LearningControllerContent1Data; response: T.LearningControllerContent1Responses[keyof T.LearningControllerContent1Responses] }
  "GET /api/v2/lessons/me/progress": { request: T.LearningControllerProgress1Data; response: T.LearningControllerProgress1Responses[keyof T.LearningControllerProgress1Responses] }
  "GET /api/v2/market-analysis/{type}": { request: T.ListMarketReportsV2Data; response: T.ListMarketReportsV2Responses[keyof T.ListMarketReportsV2Responses] }
  "GET /api/v2/market-analysis/{type}/{sessionDate}": { request: T.GetMarketReportByDateV2Data; response: T.GetMarketReportByDateV2Responses[keyof T.GetMarketReportByDateV2Responses] }
  "GET /api/v2/market-analysis/{type}/latest": { request: T.GetMarketReportLatestV2Data; response: T.GetMarketReportLatestV2Responses[keyof T.GetMarketReportLatestV2Responses] }
  "GET /api/v2/market-data/bctc-dashboard/{symbol}": { request: T.GetBctcDashboardGetApiV2MarketDataBctcDashboardSymbolData; response: T.GetBctcDashboardGetApiV2MarketDataBctcDashboardSymbolResponses[keyof T.GetBctcDashboardGetApiV2MarketDataBctcDashboardSymbolResponses] }
  "GET /api/v2/market-data/bctc/{symbol}": { request: T.GetBctcGetApiV2MarketDataBctcSymbolData; response: T.GetBctcGetApiV2MarketDataBctcSymbolResponses[keyof T.GetBctcGetApiV2MarketDataBctcSymbolResponses] }
  "GET /api/v2/market-data/company/{symbol}/bctc": { request: T.GetBctcGetApiV2MarketDataCompanySymbolBctcData; response: T.GetBctcGetApiV2MarketDataCompanySymbolBctcResponses[keyof T.GetBctcGetApiV2MarketDataCompanySymbolBctcResponses] }
  "GET /api/v2/market-data/company/{symbol}/bctc-dashboard": { request: T.GetBctcDashboardGetApiV2MarketDataCompanySymbolBctcDashboardData; response: T.GetBctcDashboardGetApiV2MarketDataCompanySymbolBctcDashboardResponses[keyof T.GetBctcDashboardGetApiV2MarketDataCompanySymbolBctcDashboardResponses] }
  "GET /api/v2/market-data/company/{symbol}/details": { request: T.MarketDataControllerDetails1Data; response: T.MarketDataControllerDetails1Responses[keyof T.MarketDataControllerDetails1Responses] }
  "GET /api/v2/market-data/company/{symbol}/news": { request: T.MarketDataControllerNews1Data; response: T.MarketDataControllerNews1Responses[keyof T.MarketDataControllerNews1Responses] }
  "GET /api/v2/market-data/company/{symbol}/officers": { request: T.MarketDataControllerOfficers1Data; response: T.MarketDataControllerOfficers1Responses[keyof T.MarketDataControllerOfficers1Responses] }
  "GET /api/v2/market-data/company/{symbol}/overview": { request: T.MarketDataControllerOverview1Data; response: T.MarketDataControllerOverview1Responses[keyof T.MarketDataControllerOverview1Responses] }
  "GET /api/v2/market-data/company/{symbol}/price-chart": { request: T.MarketDataControllerPriceChart1Data; response: T.MarketDataControllerPriceChart1Responses[keyof T.MarketDataControllerPriceChart1Responses] }
  "GET /api/v2/market-data/company/{symbol}/shareholders": { request: T.MarketDataControllerShareholders1Data; response: T.MarketDataControllerShareholders1Responses[keyof T.MarketDataControllerShareholders1Responses] }
  "GET /api/v2/market-data/company/{symbol}/subsidiaries": { request: T.MarketDataControllerSubsidiaries1Data; response: T.MarketDataControllerSubsidiaries1Responses[keyof T.MarketDataControllerSubsidiaries1Responses] }
  "GET /api/v2/market-data/events/calendar": { request: T.MarketDataControllerEvents1Data; response: T.MarketDataControllerEvents1Responses[keyof T.MarketDataControllerEvents1Responses] }
  "GET /api/v2/market-data/fundamentals/{symbol}/{reportType}": { request: T.MarketDataControllerFinancial1Data; response: T.MarketDataControllerFinancial1Responses[keyof T.MarketDataControllerFinancial1Responses] }
  "GET /api/v2/market-data/funds": { request: T.MarketExtendedControllerFunds1Data; response: T.MarketExtendedControllerFunds1Responses[keyof T.MarketExtendedControllerFunds1Responses] }
  "GET /api/v2/market-data/funds/{fundId}": { request: T.MarketExtendedControllerFundDetails1Data; response: T.MarketExtendedControllerFundDetails1Responses[keyof T.MarketExtendedControllerFundDetails1Responses] }
  "GET /api/v2/market-data/funds/{fundId}/nav": { request: T.MarketExtendedControllerFundNav1Data; response: T.MarketExtendedControllerFundNav1Responses[keyof T.MarketExtendedControllerFundNav1Responses] }
  "GET /api/v2/market-data/global/crypto/{symbol}/depth": { request: T.MarketExtendedControllerCryptoDepth1Data; response: T.MarketExtendedControllerCryptoDepth1Responses[keyof T.MarketExtendedControllerCryptoDepth1Responses] }
  "GET /api/v2/market-data/global/crypto/{symbol}/ohlc": { request: T.MarketExtendedControllerCryptoOhlc1Data; response: T.MarketExtendedControllerCryptoOhlc1Responses[keyof T.MarketExtendedControllerCryptoOhlc1Responses] }
  "GET /api/v2/market-data/global/crypto/{symbol}/ticker": { request: T.MarketExtendedControllerCryptoTicker1Data; response: T.MarketExtendedControllerCryptoTicker1Responses[keyof T.MarketExtendedControllerCryptoTicker1Responses] }
  "GET /api/v2/market-data/global/forex": { request: T.MarketExtendedControllerForex1Data; response: T.MarketExtendedControllerForex1Responses[keyof T.MarketExtendedControllerForex1Responses] }
  "GET /api/v2/market-data/global/snapshot": { request: T.MarketExtendedControllerSnapshot1Data; response: T.MarketExtendedControllerSnapshot1Responses[keyof T.MarketExtendedControllerSnapshot1Responses] }
  "GET /api/v2/market-data/global/world-index": { request: T.MarketExtendedControllerWorldIndex1Data; response: T.MarketExtendedControllerWorldIndex1Responses[keyof T.MarketExtendedControllerWorldIndex1Responses] }
  "GET /api/v2/market-data/insights/ranking/{kind}": { request: T.MarketDataControllerRanking1Data; response: T.MarketDataControllerRanking1Responses[keyof T.MarketDataControllerRanking1Responses] }
  "GET /api/v2/market-data/macro/commodities": { request: T.MarketExtendedControllerCommodities1Data; response: T.MarketExtendedControllerCommodities1Responses[keyof T.MarketExtendedControllerCommodities1Responses] }
  "GET /api/v2/market-data/macro/commodities/{code}": { request: T.MarketExtendedControllerCommodity1Data; response: T.MarketExtendedControllerCommodity1Responses[keyof T.MarketExtendedControllerCommodity1Responses] }
  "GET /api/v2/market-data/macro/economy/{indicator}": { request: T.MarketExtendedControllerMacro1Data; response: T.MarketExtendedControllerMacro1Responses[keyof T.MarketExtendedControllerMacro1Responses] }
  "GET /api/v2/market-data/macro/fx": { request: T.MarketExtendedControllerFx1Data; response: T.MarketExtendedControllerFx1Responses[keyof T.MarketExtendedControllerFx1Responses] }
  "GET /api/v2/market-data/macro/gold": { request: T.MarketExtendedControllerGold1Data; response: T.MarketExtendedControllerGold1Responses[keyof T.MarketExtendedControllerGold1Responses] }
  "GET /api/v2/market-data/news/ai": { request: T.MarketExtendedControllerAiNews1Data; response: T.MarketExtendedControllerAiNews1Responses[keyof T.MarketExtendedControllerAiNews1Responses] }
  "GET /api/v2/market-data/news/ai/audio/{newsId}": { request: T.MarketExtendedControllerAiAudio1Data; response: T.MarketExtendedControllerAiAudio1Responses[keyof T.MarketExtendedControllerAiAudio1Responses] }
  "GET /api/v2/market-data/news/ai/catalogs": { request: T.MarketExtendedControllerAiCatalogs1Data; response: T.MarketExtendedControllerAiCatalogs1Responses[keyof T.MarketExtendedControllerAiCatalogs1Responses] }
  "GET /api/v2/market-data/news/ai/detail/{slug}": { request: T.MarketExtendedControllerAiDetail1Data; response: T.MarketExtendedControllerAiDetail1Responses[keyof T.MarketExtendedControllerAiDetail1Responses] }
  "GET /api/v2/market-data/news/ai/tickers/{symbol}": { request: T.MarketExtendedControllerAiTicker1Data; response: T.MarketExtendedControllerAiTicker1Responses[keyof T.MarketExtendedControllerAiTicker1Responses] }
  "GET /api/v2/market-data/news/latest": { request: T.MarketExtendedControllerLatestNews1Data; response: T.MarketExtendedControllerLatestNews1Responses[keyof T.MarketExtendedControllerLatestNews1Responses] }
  "GET /api/v2/market-data/news/sources": { request: T.MarketExtendedControllerNewsSources1Data; response: T.MarketExtendedControllerNewsSources1Responses[keyof T.MarketExtendedControllerNewsSources1Responses] }
  "GET /api/v2/market-data/overview/allocation": { request: T.MarketExtendedControllerAllocation1Data; response: T.MarketExtendedControllerAllocation1Responses[keyof T.MarketExtendedControllerAllocation1Responses] }
  "GET /api/v2/market-data/overview/breadth": { request: T.MarketExtendedControllerBreadth1Data; response: T.MarketExtendedControllerBreadth1Responses[keyof T.MarketExtendedControllerBreadth1Responses] }
  "GET /api/v2/market-data/overview/foreign": { request: T.MarketExtendedControllerForeign1Data; response: T.MarketExtendedControllerForeign1Responses[keyof T.MarketExtendedControllerForeign1Responses] }
  "GET /api/v2/market-data/overview/foreign/top": { request: T.MarketExtendedControllerForeignTop1Data; response: T.MarketExtendedControllerForeignTop1Responses[keyof T.MarketExtendedControllerForeignTop1Responses] }
  "GET /api/v2/market-data/overview/heatmap": { request: T.MarketExtendedControllerHeatmap1Data; response: T.MarketExtendedControllerHeatmap1Responses[keyof T.MarketExtendedControllerHeatmap1Responses] }
  "GET /api/v2/market-data/overview/heatmap/index": { request: T.MarketExtendedControllerHeatmapIndex1Data; response: T.MarketExtendedControllerHeatmapIndex1Responses[keyof T.MarketExtendedControllerHeatmapIndex1Responses] }
  "GET /api/v2/market-data/overview/index-impact": { request: T.MarketExtendedControllerIndexImpact1Data; response: T.MarketExtendedControllerIndexImpact1Responses[keyof T.MarketExtendedControllerIndexImpact1Responses] }
  "GET /api/v2/market-data/overview/liquidity": { request: T.MarketExtendedControllerLiquidity1Data; response: T.MarketExtendedControllerLiquidity1Responses[keyof T.MarketExtendedControllerLiquidity1Responses] }
  "GET /api/v2/market-data/overview/maintenance": { request: T.MarketExtendedControllerMaintenance1Data; response: T.MarketExtendedControllerMaintenance1Responses[keyof T.MarketExtendedControllerMaintenance1Responses] }
  "GET /api/v2/market-data/overview/market-index": { request: T.MarketExtendedControllerMarketIndex1Data; response: T.MarketExtendedControllerMarketIndex1Responses[keyof T.MarketExtendedControllerMarketIndex1Responses] }
  "GET /api/v2/market-data/overview/proprietary": { request: T.MarketExtendedControllerProprietary1Data; response: T.MarketExtendedControllerProprietary1Responses[keyof T.MarketExtendedControllerProprietary1Responses] }
  "GET /api/v2/market-data/overview/proprietary/top": { request: T.MarketExtendedControllerProprietaryTop1Data; response: T.MarketExtendedControllerProprietaryTop1Responses[keyof T.MarketExtendedControllerProprietaryTop1Responses] }
  "GET /api/v2/market-data/overview/sectors/allocation": { request: T.MarketExtendedControllerSectorsAllocation1Data; response: T.MarketExtendedControllerSectorsAllocation1Responses[keyof T.MarketExtendedControllerSectorsAllocation1Responses] }
  "GET /api/v2/market-data/overview/sectors/detail": { request: T.MarketExtendedControllerSectorDetail1Data; response: T.MarketExtendedControllerSectorDetail1Responses[keyof T.MarketExtendedControllerSectorDetail1Responses] }
  "GET /api/v2/market-data/overview/stock-strength": { request: T.MarketExtendedControllerStockStrength1Data; response: T.MarketExtendedControllerStockStrength1Responses[keyof T.MarketExtendedControllerStockStrength1Responses] }
  "GET /api/v2/market-data/overview/valuation": { request: T.MarketExtendedControllerValuation1Data; response: T.MarketExtendedControllerValuation1Responses[keyof T.MarketExtendedControllerValuation1Responses] }
  "GET /api/v2/market-data/quotes/{symbol}/intraday": { request: T.MarketDataControllerIntraday1Data; response: T.MarketDataControllerIntraday1Responses[keyof T.MarketDataControllerIntraday1Responses] }
  "GET /api/v2/market-data/quotes/{symbol}/ohlcv": { request: T.MarketDataControllerOhlcv1Data; response: T.MarketDataControllerOhlcv1Responses[keyof T.MarketDataControllerOhlcv1Responses] }
  "GET /api/v2/market-data/quotes/{symbol}/price-depth": { request: T.MarketDataControllerPriceDepth1Data; response: T.MarketDataControllerPriceDepth1Responses[keyof T.MarketDataControllerPriceDepth1Responses] }
  "GET /api/v2/market-data/reference/event-codes": { request: T.MarketExtendedControllerEventCodes1Data; response: T.MarketExtendedControllerEventCodes1Responses[keyof T.MarketExtendedControllerEventCodes1Responses] }
  "GET /api/v2/market-data/reference/groups/{group}/symbols": { request: T.MarketDataControllerGroupSymbols1Data; response: T.MarketDataControllerGroupSymbols1Responses[keyof T.MarketDataControllerGroupSymbols1Responses] }
  "GET /api/v2/market-data/reference/indices": { request: T.MarketDataControllerIndices1Data; response: T.MarketDataControllerIndices1Responses[keyof T.MarketDataControllerIndices1Responses] }
  "GET /api/v2/market-data/reference/industries": { request: T.MarketDataControllerIndustries1Data; response: T.MarketDataControllerIndustries1Responses[keyof T.MarketDataControllerIndustries1Responses] }
  "GET /api/v2/market-data/reference/search": { request: T.MarketExtendedControllerSearch1Data; response: T.MarketExtendedControllerSearch1Responses[keyof T.MarketExtendedControllerSearch1Responses] }
  "GET /api/v2/market-data/reference/symbols": { request: T.MarketDataControllerSymbols1Data; response: T.MarketDataControllerSymbols1Responses[keyof T.MarketDataControllerSymbols1Responses] }
  "GET /api/v2/market-data/screening/criteria": { request: T.MarketExtendedControllerScreeningCriteria1Data; response: T.MarketExtendedControllerScreeningCriteria1Responses[keyof T.MarketExtendedControllerScreeningCriteria1Responses] }
  "GET /api/v2/market-data/screening/presets": { request: T.MarketExtendedControllerScreeningPresets1Data; response: T.MarketExtendedControllerScreeningPresets1Responses[keyof T.MarketExtendedControllerScreeningPresets1Responses] }
  "GET /api/v2/market-data/sectors/information": { request: T.MarketExtendedControllerSectorInformation1Data; response: T.MarketExtendedControllerSectorInformation1Responses[keyof T.MarketExtendedControllerSectorInformation1Responses] }
  "GET /api/v2/market-data/sectors/ranking": { request: T.MarketExtendedControllerSectorRanking1Data; response: T.MarketExtendedControllerSectorRanking1Responses[keyof T.MarketExtendedControllerSectorRanking1Responses] }
  "GET /api/v2/market-data/sectors/trading-dates": { request: T.MarketExtendedControllerTradingDates1Data; response: T.MarketExtendedControllerTradingDates1Responses[keyof T.MarketExtendedControllerTradingDates1Responses] }
  "GET /api/v2/market-data/sheets/tpcp": { request: T.MarketExtendedControllerSheetTpcp1Data; response: T.MarketExtendedControllerSheetTpcp1Responses[keyof T.MarketExtendedControllerSheetTpcp1Responses] }
  "GET /api/v2/market-data/sheets/tygia": { request: T.MarketExtendedControllerSheetTygia1Data; response: T.MarketExtendedControllerSheetTygia1Responses[keyof T.MarketExtendedControllerSheetTygia1Responses] }
  "GET /api/v2/market-data/sheets/vnd": { request: T.MarketExtendedControllerSheetVnd1Data; response: T.MarketExtendedControllerSheetVnd1Responses[keyof T.MarketExtendedControllerSheetVnd1Responses] }
  "GET /api/v2/market-data/trading/{symbol}/foreign-trade": { request: T.MarketDataControllerForeignTrade1Data; response: T.MarketDataControllerForeignTrade1Responses[keyof T.MarketDataControllerForeignTrade1Responses] }
  "GET /api/v2/market-data/trading/{symbol}/foreign-trade/summary": { request: T.MarketDataControllerForeignSummary1Data; response: T.MarketDataControllerForeignSummary1Responses[keyof T.MarketDataControllerForeignSummary1Responses] }
  "GET /api/v2/market-data/trading/{symbol}/history": { request: T.MarketDataControllerHistory1Data; response: T.MarketDataControllerHistory1Responses[keyof T.MarketDataControllerHistory1Responses] }
  "GET /api/v2/market-data/trading/{symbol}/insider-deals": { request: T.MarketDataControllerInsiderDeals1Data; response: T.MarketDataControllerInsiderDeals1Responses[keyof T.MarketDataControllerInsiderDeals1Responses] }
  "GET /api/v2/market-data/trading/{symbol}/proprietary": { request: T.MarketDataControllerProprietary1Data; response: T.MarketDataControllerProprietary1Responses[keyof T.MarketDataControllerProprietary1Responses] }
  "GET /api/v2/market-data/trading/{symbol}/proprietary/summary": { request: T.MarketDataControllerProprietarySummary1Data; response: T.MarketDataControllerProprietarySummary1Responses[keyof T.MarketDataControllerProprietarySummary1Responses] }
  "GET /api/v2/market-data/trading/{symbol}/summary": { request: T.MarketDataControllerSummary1Data; response: T.MarketDataControllerSummary1Responses[keyof T.MarketDataControllerSummary1Responses] }
  "GET /api/v2/market-data/trading/{symbol}/supply-demand": { request: T.MarketDataControllerSupply1Data; response: T.MarketDataControllerSupply1Responses[keyof T.MarketDataControllerSupply1Responses] }
  "GET /api/v2/market-data/trading/{symbol}/supply-demand/summary": { request: T.MarketDataControllerSupplySummary1Data; response: T.MarketDataControllerSupplySummary1Responses[keyof T.MarketDataControllerSupplySummary1Responses] }
  "GET /api/v2/media/{token}": { request: T.MediaControllerDownloadData; response: T.MediaControllerDownloadResponses[keyof T.MediaControllerDownloadResponses] }
  "GET /api/v2/portfolio-manager/report": { request: T.GetPortfolioReportV2Data; response: T.GetPortfolioReportV2Responses[keyof T.GetPortfolioReportV2Responses] }
  "GET /api/v2/premium/admin/plans": { request: T.AdminListPremiumPlansGetApiV2PremiumAdminPlansData; response: T.AdminListPremiumPlansGetApiV2PremiumAdminPlansResponses[keyof T.AdminListPremiumPlansGetApiV2PremiumAdminPlansResponses] }
  "GET /api/v2/premium/me": { request: T.GetMyPremiumSubscriptionGetApiV2PremiumMeData; response: T.GetMyPremiumSubscriptionGetApiV2PremiumMeResponses[keyof T.GetMyPremiumSubscriptionGetApiV2PremiumMeResponses] }
  "GET /api/v2/premium/my-orders": { request: T.ListMyPremiumOrdersGetApiV2PremiumMyOrdersData; response: T.ListMyPremiumOrdersGetApiV2PremiumMyOrdersResponses[keyof T.ListMyPremiumOrdersGetApiV2PremiumMyOrdersResponses] }
  "GET /api/v2/premium/plans": { request: T.ListPremiumPlansGetApiV2PremiumPlansData; response: T.ListPremiumPlansGetApiV2PremiumPlansResponses[keyof T.ListPremiumPlansGetApiV2PremiumPlansResponses] }
  "GET /api/v2/users": { request: T.UsersControllerList1Data; response: T.UsersControllerList1Responses[keyof T.UsersControllerList1Responses] }
  "GET /api/v2/users/{userId}": { request: T.UsersControllerGet1Data; response: T.UsersControllerGet1Responses[keyof T.UsersControllerGet1Responses] }
  "GET /api/v2/users/me": { request: T.UsersControllerMe1Data; response: T.UsersControllerMe1Responses[keyof T.UsersControllerMe1Responses] }
  "GET /api/v2/virtual-trading/account": { request: T.TradingControllerAccount1Data; response: T.TradingControllerAccount1Responses[keyof T.TradingControllerAccount1Responses] }
  "GET /api/v2/virtual-trading/admin/accounts": { request: T.LegacyVirtualTradingAdminControllerAccounts1Data; response: T.LegacyVirtualTradingAdminControllerAccounts1Responses[keyof T.LegacyVirtualTradingAdminControllerAccounts1Responses] }
  "GET /api/v2/virtual-trading/admin/config": { request: T.LegacyVirtualTradingAdminControllerConfig1Data; response: T.LegacyVirtualTradingAdminControllerConfig1Responses[keyof T.LegacyVirtualTradingAdminControllerConfig1Responses] }
  "GET /api/v2/virtual-trading/leaderboard": { request: T.TradingControllerLeaderboard1Data; response: T.TradingControllerLeaderboard1Responses[keyof T.TradingControllerLeaderboard1Responses] }
  "GET /api/v2/virtual-trading/ledger": { request: T.TradingControllerLedger1Data; response: T.TradingControllerLedger1Responses[keyof T.TradingControllerLedger1Responses] }
  "GET /api/v2/virtual-trading/orders": { request: T.TradingControllerOrders1Data; response: T.TradingControllerOrders1Responses[keyof T.TradingControllerOrders1Responses] }
  "GET /api/v2/virtual-trading/portfolio": { request: T.TradingControllerPortfolio1Data; response: T.TradingControllerPortfolio1Responses[keyof T.TradingControllerPortfolio1Responses] }
  "GET /api/v2/virtual-trading/trades": { request: T.TradingControllerTrades1Data; response: T.TradingControllerTrades1Responses[keyof T.TradingControllerTrades1Responses] }
  "GET /api/v2/watchlists": { request: T.ListWatchlistV2Data; response: T.ListWatchlistV2Responses[keyof T.ListWatchlistV2Responses] }
  "GET /api/v2/watchlists/{symbol}/status": { request: T.CheckWatchlistItemV2Data; response: T.CheckWatchlistItemV2Responses[keyof T.CheckWatchlistItemV2Responses] }
  "PATCH /api/v2/admin/lessons/courses/{courseId}": { request: T.AdminLearningControllerUpdateCourse1Data; response: T.AdminLearningControllerUpdateCourse1Responses[keyof T.AdminLearningControllerUpdateCourse1Responses] }
  "PATCH /api/v2/admin/lessons/episodes/{episodeId}": { request: T.AdminLearningControllerUpdateEpisode1Data; response: T.AdminLearningControllerUpdateEpisode1Responses[keyof T.AdminLearningControllerUpdateEpisode1Responses] }
  "PATCH /api/v2/admin/vt/config": { request: T.AdminVtControllerUpdateConfig1Data; response: T.AdminVtControllerUpdateConfig1Responses[keyof T.AdminVtControllerUpdateConfig1Responses] }
  "PATCH /api/v2/cap0/task": { request: T.Cap0ControllerTask1Data; response: T.Cap0ControllerTask1Responses[keyof T.Cap0ControllerTask1Responses] }
  "PATCH /api/v2/cap1/task": { request: T.Cap1ControllerTask1Data; response: T.Cap1ControllerTask1Responses[keyof T.Cap1ControllerTask1Responses] }
  "PATCH /api/v2/cap2/task": { request: T.Cap2ControllerTask1Data; response: T.Cap2ControllerTask1Responses[keyof T.Cap2ControllerTask1Responses] }
  "PATCH /api/v2/cap3/task": { request: T.Cap3ControllerTask1Data; response: T.Cap3ControllerTask1Responses[keyof T.Cap3ControllerTask1Responses] }
  "PATCH /api/v2/cap4/task": { request: T.Cap4ControllerTask1Data; response: T.Cap4ControllerTask1Responses[keyof T.Cap4ControllerTask1Responses] }
  "PATCH /api/v2/cap5/task": { request: T.Cap5TaskPatchApiV2Cap5TaskData; response: T.Cap5TaskPatchApiV2Cap5TaskResponses[keyof T.Cap5TaskPatchApiV2Cap5TaskResponses] }
  "PATCH /api/v2/cap8/positions/{symbol}/dynamic-stop": { request: T.SetCap8DynamicStopV2Data; response: T.SetCap8DynamicStopV2Responses[keyof T.SetCap8DynamicStopV2Responses] }
  "PATCH /api/v2/premium/admin/plans/{plan_id}": { request: T.AdminUpdatePremiumPlanPatchApiV2PremiumAdminPlansPlanIdData; response: T.AdminUpdatePremiumPlanPatchApiV2PremiumAdminPlansPlanIdResponses[keyof T.AdminUpdatePremiumPlanPatchApiV2PremiumAdminPlansPlanIdResponses] }
  "PATCH /api/v2/users/{userId}": { request: T.UsersControllerUpdate1Data; response: T.UsersControllerUpdate1Responses[keyof T.UsersControllerUpdate1Responses] }
  "PATCH /api/v2/users/me": { request: T.UsersControllerUpdateMe1Data; response: T.UsersControllerUpdateMe1Responses[keyof T.UsersControllerUpdateMe1Responses] }
  "PATCH /api/v2/virtual-trading/admin/config": { request: T.LegacyVirtualTradingAdminControllerUpdateConfig1Data; response: T.LegacyVirtualTradingAdminControllerUpdateConfig1Responses[keyof T.LegacyVirtualTradingAdminControllerUpdateConfig1Responses] }
  "POST /api/v2/admin/alerts/seed": { request: T.AdminAlertsControllerSeed1Data; response: T.AdminAlertsControllerSeed1Responses[keyof T.AdminAlertsControllerSeed1Responses] }
  "POST /api/v2/admin/alerts/signals": { request: T.AdminAlertsControllerCreate1Data; response: T.AdminAlertsControllerCreate1Responses[keyof T.AdminAlertsControllerCreate1Responses] }
  "POST /api/v2/admin/alerts/telegram/webhook": { request: T.AdminAlertsControllerSetupTelegramWebhook1Data; response: T.AdminAlertsControllerSetupTelegramWebhook1Responses[keyof T.AdminAlertsControllerSetupTelegramWebhook1Responses] }
  "POST /api/v2/admin/ipn/{log_id}/retry": { request: T.AdminRetryIpnPostApiV2AdminIpnLogIdRetryData; response: T.AdminRetryIpnPostApiV2AdminIpnLogIdRetryResponses[keyof T.AdminRetryIpnPostApiV2AdminIpnLogIdRetryResponses] }
  "POST /api/v2/admin/journey/identity/qa-grants": { request: T.JourneyIdentityControllerGrantQa1Data; response: T.JourneyIdentityControllerGrantQa1Responses[keyof T.JourneyIdentityControllerGrantQa1Responses] }
  "POST /api/v2/admin/lessons/courses": { request: T.AdminLearningControllerCreateCourse1Data; response: T.AdminLearningControllerCreateCourse1Responses[keyof T.AdminLearningControllerCreateCourse1Responses] }
  "POST /api/v2/admin/lessons/courses/{courseId}/episodes": { request: T.AdminLearningControllerCreateEpisode1Data; response: T.AdminLearningControllerCreateEpisode1Responses[keyof T.AdminLearningControllerCreateEpisode1Responses] }
  "POST /api/v2/admin/lessons/courses/{courseId}/reorder": { request: T.AdminLearningControllerReorder1Data; response: T.AdminLearningControllerReorder1Responses[keyof T.AdminLearningControllerReorder1Responses] }
  "POST /api/v2/admin/lessons/courses/{courseId}/thumbnail": { request: T.AdminLearningControllerThumbnail1Data; response: T.AdminLearningControllerThumbnail1Responses[keyof T.AdminLearningControllerThumbnail1Responses] }
  "POST /api/v2/admin/lessons/episodes/{episodeId}/file": { request: T.AdminLearningControllerEpisodeFile1Data; response: T.AdminLearningControllerEpisodeFile1Responses[keyof T.AdminLearningControllerEpisodeFile1Responses] }
  "POST /api/v2/admin/payments/{order_id}/mark-paid": { request: T.AdminMarkPaymentPaidPostApiV2AdminPaymentsOrderIdMarkPaidData; response: T.AdminMarkPaymentPaidPostApiV2AdminPaymentsOrderIdMarkPaidResponses[keyof T.AdminMarkPaymentPaidPostApiV2AdminPaymentsOrderIdMarkPaidResponses] }
  "POST /api/v2/admin/payments/{order_id}/reconcile": { request: T.AdminReconcilePaymentPostApiV2AdminPaymentsOrderIdReconcileData; response: T.AdminReconcilePaymentPostApiV2AdminPaymentsOrderIdReconcileResponses[keyof T.AdminReconcilePaymentPostApiV2AdminPaymentsOrderIdReconcileResponses] }
  "POST /api/v2/admin/payments/{order_id}/refund": { request: T.AdminRefundPaymentPostApiV2AdminPaymentsOrderIdRefundData; response: T.AdminRefundPaymentPostApiV2AdminPaymentsOrderIdRefundResponses[keyof T.AdminRefundPaymentPostApiV2AdminPaymentsOrderIdRefundResponses] }
  "POST /api/v2/admin/subscriptions/{sub_id}/cancel": { request: T.AdminCancelSubscriptionPostApiV2AdminSubscriptionsSubIdCancelData; response: T.AdminCancelSubscriptionPostApiV2AdminSubscriptionsSubIdCancelResponses[keyof T.AdminCancelSubscriptionPostApiV2AdminSubscriptionsSubIdCancelResponses] }
  "POST /api/v2/admin/subscriptions/{sub_id}/extend": { request: T.AdminExtendSubscriptionPostApiV2AdminSubscriptionsSubIdExtendData; response: T.AdminExtendSubscriptionPostApiV2AdminSubscriptionsSubIdExtendResponses[keyof T.AdminExtendSubscriptionPostApiV2AdminSubscriptionsSubIdExtendResponses] }
  "POST /api/v2/admin/system/jobs/{jobId}/run": { request: T.AdminSystemControllerRun1Data; response: T.AdminSystemControllerRun1Responses[keyof T.AdminSystemControllerRun1Responses] }
  "POST /api/v2/admin/users/{userId}/resend-verification": { request: T.AdminUsersControllerResendVerification1Data; response: T.AdminUsersControllerResendVerification1Responses[keyof T.AdminUsersControllerResendVerification1Responses] }
  "POST /api/v2/admin/users/{userId}/reset-password": { request: T.AdminUsersControllerResetPassword1Data; response: T.AdminUsersControllerResetPassword1Responses[keyof T.AdminUsersControllerResetPassword1Responses] }
  "POST /api/v2/admin/users/bulk": { request: T.AdminUsersControllerBulk1Data; response: T.AdminUsersControllerBulk1Responses[keyof T.AdminUsersControllerBulk1Responses] }
  "POST /api/v2/admin/vt/accounts/{accountId}/cash-adjust": { request: T.AdminVtControllerCashAdjust1Data; response: T.AdminVtControllerCashAdjust1Responses[keyof T.AdminVtControllerCashAdjust1Responses] }
  "POST /api/v2/admin/vt/accounts/{accountId}/freeze": { request: T.AdminVtControllerFreeze1Data; response: T.AdminVtControllerFreeze1Responses[keyof T.AdminVtControllerFreeze1Responses] }
  "POST /api/v2/admin/vt/accounts/{accountId}/reset": { request: T.AdminVtControllerReset1Data; response: T.AdminVtControllerReset1Responses[keyof T.AdminVtControllerReset1Responses] }
  "POST /api/v2/admin/vt/accounts/{accountId}/unfreeze": { request: T.AdminVtControllerUnfreeze1Data; response: T.AdminVtControllerUnfreeze1Responses[keyof T.AdminVtControllerUnfreeze1Responses] }
  "POST /api/v2/admin/vt/reset-all": { request: T.AdminVtControllerResetAll1Data; response: T.AdminVtControllerResetAll1Responses[keyof T.AdminVtControllerResetAll1Responses] }
  "POST /api/v2/ai/dashboard/analyze": { request: T.AnalyzeDashboardV2PostApiV2AiDashboardAnalyzeData; response: T.AnalyzeDashboardV2PostApiV2AiDashboardAnalyzeResponses[keyof T.AnalyzeDashboardV2PostApiV2AiDashboardAnalyzeResponses] }
  "POST /api/v2/ai/industry/analyze": { request: T.AnalyzeIndustryV2PostApiV2AiIndustryAnalyzeData; response: T.AnalyzeIndustryV2PostApiV2AiIndustryAnalyzeResponses[keyof T.AnalyzeIndustryV2PostApiV2AiIndustryAnalyzeResponses] }
  "POST /api/v2/ai/industry/analyze-batch": { request: T.AnalyzeIndustryBatchV2PostApiV2AiIndustryAnalyzeBatchData; response: T.AnalyzeIndustryBatchV2PostApiV2AiIndustryAnalyzeBatchResponses[keyof T.AnalyzeIndustryBatchV2PostApiV2AiIndustryAnalyzeBatchResponses] }
  "POST /api/v2/ai/insight/analyze": { request: T.AnalyzeInsightV2PostApiV2AiInsightAnalyzeData; response: T.AnalyzeInsightV2PostApiV2AiInsightAnalyzeResponses[keyof T.AnalyzeInsightV2PostApiV2AiInsightAnalyzeResponses] }
  "POST /api/v2/alerts/rules": { request: T.AlertsControllerCreateRule1Data; response: T.AlertsControllerCreateRule1Responses[keyof T.AlertsControllerCreateRule1Responses] }
  "POST /api/v2/alerts/telegram/link": { request: T.AlertsControllerCreateTelegramLink1Data; response: T.AlertsControllerCreateTelegramLink1Responses[keyof T.AlertsControllerCreateTelegramLink1Responses] }
  "POST /api/v2/auth/forgot-password": { request: T.AuthControllerForgotPassword1Data; response: T.AuthControllerForgotPassword1Responses[keyof T.AuthControllerForgotPassword1Responses] }
  "POST /api/v2/auth/login": { request: T.AuthControllerLogin1Data; response: T.AuthControllerLogin1Responses[keyof T.AuthControllerLogin1Responses] }
  "POST /api/v2/auth/logout": { request: T.AuthControllerLogout1Data; response: T.AuthControllerLogout1Responses[keyof T.AuthControllerLogout1Responses] }
  "POST /api/v2/auth/refresh": { request: T.AuthControllerRefresh1Data; response: T.AuthControllerRefresh1Responses[keyof T.AuthControllerRefresh1Responses] }
  "POST /api/v2/auth/register": { request: T.AuthControllerRegister1Data; response: T.AuthControllerRegister1Responses[keyof T.AuthControllerRegister1Responses] }
  "POST /api/v2/auth/reset-password": { request: T.AuthControllerResetPassword1Data; response: T.AuthControllerResetPassword1Responses[keyof T.AuthControllerResetPassword1Responses] }
  "POST /api/v2/backtest/run": { request: T.QuantControllerRun0Data; response: T.QuantControllerRun0Responses[keyof T.QuantControllerRun0Responses] }
  "POST /api/v2/backtest/strategies": { request: T.QuantControllerCreate0Data; response: T.QuantControllerCreate0Responses[keyof T.QuantControllerCreate0Responses] }
  "POST /api/v2/bot/mascot/ui-events": { request: T.JourneyIdentityControllerUiEvent1Data; response: T.JourneyIdentityControllerUiEvent1Responses[keyof T.JourneyIdentityControllerUiEvent1Responses] }
  "POST /api/v2/cap0/enter": { request: T.Cap0ControllerEnter1Data; response: T.Cap0ControllerEnter1Responses[keyof T.Cap0ControllerEnter1Responses] }
  "POST /api/v2/cap0/graduate": { request: T.Cap0ControllerGraduate1Data; response: T.Cap0ControllerGraduate1Responses[keyof T.Cap0ControllerGraduate1Responses] }
  "POST /api/v2/cap0/kehoach": { request: T.Cap0ControllerKehoach1Data; response: T.Cap0ControllerKehoach1Responses[keyof T.Cap0ControllerKehoach1Responses] }
  "POST /api/v2/cap0/placement": { request: T.Cap0ControllerPlacement1Data; response: T.Cap0ControllerPlacement1Responses[keyof T.Cap0ControllerPlacement1Responses] }
  "POST /api/v2/cap0/tours/{tour}/complete": { request: T.Cap0ControllerCompleteTour1Data; response: T.Cap0ControllerCompleteTour1Responses[keyof T.Cap0ControllerCompleteTour1Responses] }
  "POST /api/v2/cap1/enter": { request: T.Cap1ControllerEnter1Data; response: T.Cap1ControllerEnter1Responses[keyof T.Cap1ControllerEnter1Responses] }
  "POST /api/v2/cap1/graduate": { request: T.Cap1ControllerGraduate1Data; response: T.Cap1ControllerGraduate1Responses[keyof T.Cap1ControllerGraduate1Responses] }
  "POST /api/v2/cap1/kehoach": { request: T.Cap1ControllerKehoach1Data; response: T.Cap1ControllerKehoach1Responses[keyof T.Cap1ControllerKehoach1Responses] }
  "POST /api/v2/cap1/ketso": { request: T.Cap1ControllerKetso1Data; response: T.Cap1ControllerKetso1Responses[keyof T.Cap1ControllerKetso1Responses] }
  "POST /api/v2/cap2/alerts/{alert_id}/action": { request: T.Cap2ControllerAction1Data; response: T.Cap2ControllerAction1Responses[keyof T.Cap2ControllerAction1Responses] }
  "POST /api/v2/cap2/alerts/{alert_id}/check": { request: T.Cap2ControllerCheck1Data; response: T.Cap2ControllerCheck1Responses[keyof T.Cap2ControllerCheck1Responses] }
  "POST /api/v2/cap2/alerts/{alert_id}/claim": { request: T.Cap2ControllerClaim1Data; response: T.Cap2ControllerClaim1Responses[keyof T.Cap2ControllerClaim1Responses] }
  "POST /api/v2/cap2/alerts/{alert_id}/dismiss": { request: T.Cap2ControllerDismiss1Data; response: T.Cap2ControllerDismiss1Responses[keyof T.Cap2ControllerDismiss1Responses] }
  "POST /api/v2/cap2/alerts/{alert_id}/snooze": { request: T.Cap2ControllerSnooze1Data; response: T.Cap2ControllerSnooze1Responses[keyof T.Cap2ControllerSnooze1Responses] }
  "POST /api/v2/cap2/alerts/pre-buy": { request: T.Cap2ControllerPreBuy1Data; response: T.Cap2ControllerPreBuy1Responses[keyof T.Cap2ControllerPreBuy1Responses] }
  "POST /api/v2/cap2/enter": { request: T.Cap2ControllerEnter1Data; response: T.Cap2ControllerEnter1Responses[keyof T.Cap2ControllerEnter1Responses] }
  "POST /api/v2/cap2/graduate": { request: T.Cap2ControllerGraduate1Data; response: T.Cap2ControllerGraduate1Responses[keyof T.Cap2ControllerGraduate1Responses] }
  "POST /api/v2/cap2/kehoach": { request: T.Cap2ControllerKehoach1Data; response: T.Cap2ControllerKehoach1Responses[keyof T.Cap2ControllerKehoach1Responses] }
  "POST /api/v2/cap2/ketso": { request: T.Cap2ControllerKetso1Data; response: T.Cap2ControllerKetso1Responses[keyof T.Cap2ControllerKetso1Responses] }
  "POST /api/v2/cap3/enter": { request: T.Cap3ControllerEnter1Data; response: T.Cap3ControllerEnter1Responses[keyof T.Cap3ControllerEnter1Responses] }
  "POST /api/v2/cap3/graduate": { request: T.Cap3ControllerGraduate1Data; response: T.Cap3ControllerGraduate1Responses[keyof T.Cap3ControllerGraduate1Responses] }
  "POST /api/v2/cap3/kehoach": { request: T.Cap3ControllerPlan1Data; response: T.Cap3ControllerPlan1Responses[keyof T.Cap3ControllerPlan1Responses] }
  "POST /api/v2/cap3/khau-vi": { request: T.Cap3ControllerRisk1Data; response: T.Cap3ControllerRisk1Responses[keyof T.Cap3ControllerRisk1Responses] }
  "POST /api/v2/cap4/enter": { request: T.Cap4ControllerEnter1Data; response: T.Cap4ControllerEnter1Responses[keyof T.Cap4ControllerEnter1Responses] }
  "POST /api/v2/cap4/graduate": { request: T.Cap4ControllerGraduate1Data; response: T.Cap4ControllerGraduate1Responses[keyof T.Cap4ControllerGraduate1Responses] }
  "POST /api/v2/cap4/kehoach": { request: T.Cap4ControllerPlan1Data; response: T.Cap4ControllerPlan1Responses[keyof T.Cap4ControllerPlan1Responses] }
  "POST /api/v2/cap5/enter": { request: T.Cap5EnterPostApiV2Cap5EnterData; response: T.Cap5EnterPostApiV2Cap5EnterResponses[keyof T.Cap5EnterPostApiV2Cap5EnterResponses] }
  "POST /api/v2/cap5/graduate": { request: T.Cap5GraduatePostApiV2Cap5GraduateData; response: T.Cap5GraduatePostApiV2Cap5GraduateResponses[keyof T.Cap5GraduatePostApiV2Cap5GraduateResponses] }
  "POST /api/v2/cap5/tour-sanma": { request: T.Cap5TourSanmaPostApiV2Cap5TourSanmaData; response: T.Cap5TourSanmaPostApiV2Cap5TourSanmaResponses[keyof T.Cap5TourSanmaPostApiV2Cap5TourSanmaResponses] }
  "POST /api/v2/cap5/watchlist": { request: T.Cap5AddWatchlistPostApiV2Cap5WatchlistData; response: T.Cap5AddWatchlistPostApiV2Cap5WatchlistResponses[keyof T.Cap5AddWatchlistPostApiV2Cap5WatchlistResponses] }
  "POST /api/v2/cap6/enter": { request: T.Cap6EnterPostApiV2Cap6EnterData; response: T.Cap6EnterPostApiV2Cap6EnterResponses[keyof T.Cap6EnterPostApiV2Cap6EnterResponses] }
  "POST /api/v2/cap6/graduate": { request: T.Cap6GraduatePostApiV2Cap6GraduateData; response: T.Cap6GraduatePostApiV2Cap6GraduateResponses[keyof T.Cap6GraduatePostApiV2Cap6GraduateResponses] }
  "POST /api/v2/cap6/kehoach": { request: T.Cap6RecordPlanPostApiV2Cap6KehoachData; response: T.Cap6RecordPlanPostApiV2Cap6KehoachResponses[keyof T.Cap6RecordPlanPostApiV2Cap6KehoachResponses] }
  "POST /api/v2/cap6/skip": { request: T.Cap6SkipPostApiV2Cap6SkipData; response: T.Cap6SkipPostApiV2Cap6SkipResponses[keyof T.Cap6SkipPostApiV2Cap6SkipResponses] }
  "POST /api/v2/cap6/tour-mauthuan": { request: T.Cap6TourMauThuanPostApiV2Cap6TourMauthuanData; response: T.Cap6TourMauThuanPostApiV2Cap6TourMauthuanResponses[keyof T.Cap6TourMauThuanPostApiV2Cap6TourMauthuanResponses] }
  "POST /api/v2/cap7/enter": { request: T.EnterCap7V2Data; response: T.EnterCap7V2Responses[keyof T.EnterCap7V2Responses] }
  "POST /api/v2/cap7/graduate": { request: T.GraduateCap7V2Data; response: T.GraduateCap7V2Responses[keyof T.GraduateCap7V2Responses] }
  "POST /api/v2/cap8/enter": { request: T.EnterCap8V2Data; response: T.EnterCap8V2Responses[keyof T.EnterCap8V2Responses] }
  "POST /api/v2/cap8/exits": { request: T.RecordCap8ExitV2Data; response: T.RecordCap8ExitV2Responses[keyof T.RecordCap8ExitV2Responses] }
  "POST /api/v2/cap8/graduate": { request: T.GraduateCap8V2Data; response: T.GraduateCap8V2Responses[keyof T.GraduateCap8V2Responses] }
  "POST /api/v2/cap8/positions/{symbol}/sync-plan": { request: T.SyncCap8PlanV2Data; response: T.SyncCap8PlanV2Responses[keyof T.SyncCap8PlanV2Responses] }
  "POST /api/v2/journey/assessments": { request: T.JourneyIdentityControllerSubmit1Data; response: T.JourneyIdentityControllerSubmit1Responses[keyof T.JourneyIdentityControllerSubmit1Responses] }
  "POST /api/v2/journey/assessments/{assessmentId}/reveal": { request: T.JourneyIdentityControllerReveal1Data; response: T.JourneyIdentityControllerReveal1Responses[keyof T.JourneyIdentityControllerReveal1Responses] }
  "POST /api/v2/journey/events": { request: T.JourneyEventControllerRecord1Data; response: T.JourneyEventControllerRecord1Responses[keyof T.JourneyEventControllerRecord1Responses] }
  "POST /api/v2/journey/reading-datasets": { request: T.JourneyIdentityControllerCreateDataset1Data; response: T.JourneyIdentityControllerCreateDataset1Responses[keyof T.JourneyIdentityControllerCreateDataset1Responses] }
  "POST /api/v2/lessons/episodes/{episodeId}/progress": { request: T.LearningControllerUpdateProgress1Data; response: T.LearningControllerUpdateProgress1Responses[keyof T.LearningControllerUpdateProgress1Responses] }
  "POST /api/v2/market-analysis/{type}/run": { request: T.RunMarketReportV2Data; response: T.RunMarketReportV2Responses[keyof T.RunMarketReportV2Responses] }
  "POST /api/v2/market-data/screening/search": { request: T.MarketExtendedControllerScreeningSearch1Data; response: T.MarketExtendedControllerScreeningSearch1Responses[keyof T.MarketExtendedControllerScreeningSearch1Responses] }
  "POST /api/v2/market-data/trading/price-board": { request: T.MarketDataControllerPriceBoard1Data; response: T.MarketDataControllerPriceBoard1Responses[keyof T.MarketDataControllerPriceBoard1Responses] }
  "POST /api/v2/portfolio-manager/analyze": { request: T.AnalyzePortfolioV2Data; response: T.AnalyzePortfolioV2Responses[keyof T.AnalyzePortfolioV2Responses] }
  "POST /api/v2/premium/admin/plans": { request: T.AdminCreatePremiumPlanPostApiV2PremiumAdminPlansData; response: T.AdminCreatePremiumPlanPostApiV2PremiumAdminPlansResponses[keyof T.AdminCreatePremiumPlanPostApiV2PremiumAdminPlansResponses] }
  "POST /api/v2/premium/admin/users/{user_id}/grant": { request: T.AdminGrantPremiumPostApiV2PremiumAdminUsersUserIdGrantData; response: T.AdminGrantPremiumPostApiV2PremiumAdminUsersUserIdGrantResponses[keyof T.AdminGrantPremiumPostApiV2PremiumAdminUsersUserIdGrantResponses] }
  "POST /api/v2/premium/checkout": { request: T.CreatePremiumCheckoutPostApiV2PremiumCheckoutData; response: T.CreatePremiumCheckoutPostApiV2PremiumCheckoutResponses[keyof T.CreatePremiumCheckoutPostApiV2PremiumCheckoutResponses] }
  "POST /api/v2/premium/sepay/ipn": { request: T.ReceiveSePayIpnPostApiV2PremiumSepayIpnData; response: T.ReceiveSePayIpnPostApiV2PremiumSepayIpnResponses[keyof T.ReceiveSePayIpnPostApiV2PremiumSepayIpnResponses] }
  "POST /api/v2/telegram/webhook/{secret}": { request: T.TelegramControllerWebhook1Data; response: T.TelegramControllerWebhook1Responses[keyof T.TelegramControllerWebhook1Responses] }
  "POST /api/v2/users": { request: T.UsersControllerCreate1Data; response: T.UsersControllerCreate1Responses[keyof T.UsersControllerCreate1Responses] }
  "POST /api/v2/virtual-trading/account/activate": { request: T.TradingControllerActivate1Data; response: T.TradingControllerActivate1Responses[keyof T.TradingControllerActivate1Responses] }
  "POST /api/v2/virtual-trading/admin/reset-all": { request: T.LegacyVirtualTradingAdminControllerResetAll1Data; response: T.LegacyVirtualTradingAdminControllerResetAll1Responses[keyof T.LegacyVirtualTradingAdminControllerResetAll1Responses] }
  "POST /api/v2/virtual-trading/admin/users/{userId}/reset": { request: T.LegacyVirtualTradingAdminControllerReset1Data; response: T.LegacyVirtualTradingAdminControllerReset1Responses[keyof T.LegacyVirtualTradingAdminControllerReset1Responses] }
  "POST /api/v2/virtual-trading/orders": { request: T.TradingControllerPlace1Data; response: T.TradingControllerPlace1Responses[keyof T.TradingControllerPlace1Responses] }
  "POST /api/v2/virtual-trading/orders/{orderId}/cancel": { request: T.TradingControllerCancel1Data; response: T.TradingControllerCancel1Responses[keyof T.TradingControllerCancel1Responses] }
  "POST /api/v2/virtual-trading/refresh": { request: T.TradingControllerRefresh1Data; response: T.TradingControllerRefresh1Responses[keyof T.TradingControllerRefresh1Responses] }
  "POST /api/v2/watchlists": { request: T.AddWatchlistItemV2Data; response: T.AddWatchlistItemV2Responses[keyof T.AddWatchlistItemV2Responses] }
  "PUT /api/v2/admin/alerts/signals/{key}": { request: T.AdminAlertsControllerUpdate1Data; response: T.AdminAlertsControllerUpdate1Responses[keyof T.AdminAlertsControllerUpdate1Responses] }
  "PUT /api/v2/alerts/rules/{ruleId}": { request: T.AlertsControllerUpdateRule1Data; response: T.AlertsControllerUpdateRule1Responses[keyof T.AlertsControllerUpdateRule1Responses] }
  "PUT /api/v2/backtest/strategies/{strategyId}": { request: T.QuantControllerUpdate0Data; response: T.QuantControllerUpdate0Responses[keyof T.QuantControllerUpdate0Responses] }
  "PUT /api/v2/chart-drawings/{symbol}": { request: T.SaveChartDrawingV2Data; response: T.SaveChartDrawingV2Responses[keyof T.SaveChartDrawingV2Responses] }
  "PUT /api/v2/watchlists/reorder": { request: T.ReorderWatchlistV2Data; response: T.ReorderWatchlistV2Responses[keyof T.ReorderWatchlistV2Responses] }
}

export const operationMap: Record<keyof OperationMap, { request: string; response: string }> = {
  "DELETE /api/v2/admin/alerts/signals/{key}": { request: "AdminAlertsControllerRemove1Data", response: "AdminAlertsControllerRemove1Responses" },
  "DELETE /api/v2/admin/lessons/courses/{courseId}": { request: "AdminLearningControllerDeleteCourse1Data", response: "AdminLearningControllerDeleteCourse1Responses" },
  "DELETE /api/v2/admin/lessons/episodes/{episodeId}": { request: "AdminLearningControllerDeleteEpisode1Data", response: "AdminLearningControllerDeleteEpisode1Responses" },
  "DELETE /api/v2/alerts/rules/{ruleId}": { request: "AlertsControllerDeleteRule1Data", response: "AlertsControllerDeleteRule1Responses" },
  "DELETE /api/v2/alerts/telegram": { request: "AlertsControllerUnlinkTelegram1Data", response: "AlertsControllerUnlinkTelegram1Responses" },
  "DELETE /api/v2/backtest/strategies/{strategyId}": { request: "QuantControllerDelete0Data", response: "QuantControllerDelete0Responses" },
  "DELETE /api/v2/cap5/watchlist/{symbol}": { request: "Cap5RemoveWatchlistDeleteApiV2Cap5WatchlistSymbolData", response: "Cap5RemoveWatchlistDeleteApiV2Cap5WatchlistSymbolResponses" },
  "DELETE /api/v2/chart-drawings/{symbol}": { request: "DeleteChartDrawingV2Data", response: "DeleteChartDrawingV2Responses" },
  "DELETE /api/v2/premium/admin/plans/{plan_id}": { request: "AdminDeletePremiumPlanDeleteApiV2PremiumAdminPlansPlanIdData", response: "AdminDeletePremiumPlanDeleteApiV2PremiumAdminPlansPlanIdResponses" },
  "DELETE /api/v2/users/{userId}": { request: "UsersControllerRemove1Data", response: "UsersControllerRemove1Responses" },
  "DELETE /api/v2/watchlists/{symbol}": { request: "RemoveWatchlistItemV2Data", response: "RemoveWatchlistItemV2Responses" },
  "GET /api/v2/admin/alerts/factor-library": { request: "AdminAlertsControllerFactorLibrary1Data", response: "AdminAlertsControllerFactorLibrary1Responses" },
  "GET /api/v2/admin/alerts/indicators": { request: "AdminAlertsControllerIndicators1Data", response: "AdminAlertsControllerIndicators1Responses" },
  "GET /api/v2/admin/alerts/signals": { request: "AdminAlertsControllerSignals1Data", response: "AdminAlertsControllerSignals1Responses" },
  "GET /api/v2/admin/audit": { request: "AdminAuditControllerList1Data", response: "AdminAuditControllerList1Responses" },
  "GET /api/v2/admin/audit/export": { request: "AdminAuditControllerExport1Data", response: "AdminAuditControllerExport1Responses" },
  "GET /api/v2/admin/ipn": { request: "AdminListIpnLogsGetApiV2AdminIpnData", response: "AdminListIpnLogsGetApiV2AdminIpnResponses" },
  "GET /api/v2/admin/ipn/{log_id}": { request: "AdminGetIpnLogGetApiV2AdminIpnLogIdData", response: "AdminGetIpnLogGetApiV2AdminIpnLogIdResponses" },
  "GET /api/v2/admin/lessons/courses": { request: "AdminLearningControllerCourses1Data", response: "AdminLearningControllerCourses1Responses" },
  "GET /api/v2/admin/lessons/courses/{courseId}": { request: "AdminLearningControllerCourse1Data", response: "AdminLearningControllerCourse1Responses" },
  "GET /api/v2/admin/metrics/overview": { request: "AdminMetricsControllerOverview1Data", response: "AdminMetricsControllerOverview1Responses" },
  "GET /api/v2/admin/metrics/plan-distribution": { request: "AdminMetricsControllerPlanDistribution1Data", response: "AdminMetricsControllerPlanDistribution1Responses" },
  "GET /api/v2/admin/metrics/revenue": { request: "AdminMetricsControllerRevenue1Data", response: "AdminMetricsControllerRevenue1Responses" },
  "GET /api/v2/admin/payments": { request: "AdminListPaymentsGetApiV2AdminPaymentsData", response: "AdminListPaymentsGetApiV2AdminPaymentsResponses" },
  "GET /api/v2/admin/payments/{order_id}": { request: "AdminGetPaymentGetApiV2AdminPaymentsOrderIdData", response: "AdminGetPaymentGetApiV2AdminPaymentsOrderIdResponses" },
  "GET /api/v2/admin/subscriptions": { request: "AdminListSubscriptionsGetApiV2AdminSubscriptionsData", response: "AdminListSubscriptionsGetApiV2AdminSubscriptionsResponses" },
  "GET /api/v2/admin/subscriptions/{sub_id}": { request: "AdminGetSubscriptionGetApiV2AdminSubscriptionsSubIdData", response: "AdminGetSubscriptionGetApiV2AdminSubscriptionsSubIdResponses" },
  "GET /api/v2/admin/system/status": { request: "AdminSystemControllerStatus1Data", response: "AdminSystemControllerStatus1Responses" },
  "GET /api/v2/admin/users/{user_id}/subscriptions/history": { request: "AdminGetSubscriptionHistoryGetApiV2AdminUsersUserIdSubscriptionsHistoryData", response: "AdminGetSubscriptionHistoryGetApiV2AdminUsersUserIdSubscriptionsHistoryResponses" },
  "GET /api/v2/admin/users/{userId}/360": { request: "AdminUsersControllerGet3601Data", response: "AdminUsersControllerGet3601Responses" },
  "GET /api/v2/admin/users/{userId}/login-history": { request: "AdminUsersControllerLoginHistory1Data", response: "AdminUsersControllerLoginHistory1Responses" },
  "GET /api/v2/admin/users/export": { request: "AdminUsersControllerExport1Data", response: "AdminUsersControllerExport1Responses" },
  "GET /api/v2/admin/vt/accounts": { request: "AdminVtControllerAccounts1Data", response: "AdminVtControllerAccounts1Responses" },
  "GET /api/v2/admin/vt/accounts/{accountId}": { request: "AdminVtControllerAccount1Data", response: "AdminVtControllerAccount1Responses" },
  "GET /api/v2/admin/vt/accounts/{accountId}/ledger": { request: "AdminVtControllerLedger1Data", response: "AdminVtControllerLedger1Responses" },
  "GET /api/v2/admin/vt/accounts/{accountId}/orders": { request: "AdminVtControllerOrders1Data", response: "AdminVtControllerOrders1Responses" },
  "GET /api/v2/admin/vt/accounts/{accountId}/positions": { request: "AdminVtControllerPositions1Data", response: "AdminVtControllerPositions1Responses" },
  "GET /api/v2/admin/vt/accounts/{accountId}/settlements": { request: "AdminVtControllerSettlements1Data", response: "AdminVtControllerSettlements1Responses" },
  "GET /api/v2/admin/vt/accounts/{accountId}/stats": { request: "AdminVtControllerStats1Data", response: "AdminVtControllerStats1Responses" },
  "GET /api/v2/admin/vt/accounts/{accountId}/trades": { request: "AdminVtControllerTrades1Data", response: "AdminVtControllerTrades1Responses" },
  "GET /api/v2/admin/vt/config": { request: "AdminVtControllerConfig1Data", response: "AdminVtControllerConfig1Responses" },
  "GET /api/v2/ai/bctc-dashboard/{symbol}": { request: "GetBctcNarrativeV2GetApiV2AiBctcDashboardSymbolData", response: "GetBctcNarrativeV2GetApiV2AiBctcDashboardSymbolResponses" },
  "GET /api/v2/ai/bctc/{symbol}": { request: "GetBctcAnalysisV2GetApiV2AiBctcSymbolData", response: "GetBctcAnalysisV2GetApiV2AiBctcSymbolResponses" },
  "GET /api/v2/ai/forecast/ranking": { request: "GetForecastRankingV2GetApiV2AiForecastRankingData", response: "GetForecastRankingV2GetApiV2AiForecastRankingResponses" },
  "GET /api/v2/ai/forecast/symbols/{symbol}": { request: "GetForecastForSymbolV2GetApiV2AiForecastSymbolsSymbolData", response: "GetForecastForSymbolV2GetApiV2AiForecastSymbolsSymbolResponses" },
  "GET /api/v2/ai/insight/{symbol}": { request: "GetInsightV2GetApiV2AiInsightSymbolData", response: "GetInsightV2GetApiV2AiInsightSymbolResponses" },
  "GET /api/v2/ai/patterns/{kind}/symbols": { request: "ListPatternSymbolsV2GetApiV2AiPatternsKindSymbolsData", response: "ListPatternSymbolsV2GetApiV2AiPatternsKindSymbolsResponses" },
  "GET /api/v2/ai/patterns/candles": { request: "GetCandlePatternsV2GetApiV2AiPatternsCandlesData", response: "GetCandlePatternsV2GetApiV2AiPatternsCandlesResponses" },
  "GET /api/v2/ai/patterns/charts": { request: "GetChartPatternsV2GetApiV2AiPatternsChartsData", response: "GetChartPatternsV2GetApiV2AiPatternsChartsResponses" },
  "GET /api/v2/alerts/events": { request: "AlertsControllerListEvents1Data", response: "AlertsControllerListEvents1Responses" },
  "GET /api/v2/alerts/rules": { request: "AlertsControllerListRules1Data", response: "AlertsControllerListRules1Responses" },
  "GET /api/v2/alerts/signals": { request: "AlertsControllerListSignals1Data", response: "AlertsControllerListSignals1Responses" },
  "GET /api/v2/alerts/telegram": { request: "AlertsControllerTelegramStatus1Data", response: "AlertsControllerTelegramStatus1Responses" },
  "GET /api/v2/auth/me": { request: "AuthControllerMe1Data", response: "AuthControllerMe1Responses" },
  "GET /api/v2/auth/reset-password": { request: "AuthControllerResetPasswordForm1Data", response: "AuthControllerResetPasswordForm1Responses" },
  "GET /api/v2/auth/verify-email": { request: "AuthControllerVerifyEmail1Data", response: "AuthControllerVerifyEmail1Responses" },
  "GET /api/v2/backtest/catalog": { request: "QuantControllerCatalog0Data", response: "QuantControllerCatalog0Responses" },
  "GET /api/v2/backtest/strategies": { request: "QuantControllerList0Data", response: "QuantControllerList0Responses" },
  "GET /api/v2/bot": { request: "GetBotOverviewGetApiV2BotData", response: "GetBotOverviewGetApiV2BotResponses" },
  "GET /api/v2/bot/journal": { request: "GetBotJournalGetApiV2BotJournalData", response: "GetBotJournalGetApiV2BotJournalResponses" },
  "GET /api/v2/bot/mascot": { request: "JourneyIdentityControllerGetMascot1Data", response: "JourneyIdentityControllerGetMascot1Responses" },
  "GET /api/v2/bot/performance": { request: "GetBotPerformanceGetApiV2BotPerformanceData", response: "GetBotPerformanceGetApiV2BotPerformanceResponses" },
  "GET /api/v2/bot/positions": { request: "GetBotPositionsGetApiV2BotPositionsData", response: "GetBotPositionsGetApiV2BotPositionsResponses" },
  "GET /api/v2/bot/status": { request: "GetBotStatusGetApiV2BotStatusData", response: "GetBotStatusGetApiV2BotStatusResponses" },
  "GET /api/v2/cap0/kehoach": { request: "Cap0ControllerGetKehoach1Data", response: "Cap0ControllerGetKehoach1Responses" },
  "GET /api/v2/cap0/placement": { request: "Cap0ControllerGetPlacement1Data", response: "Cap0ControllerGetPlacement1Responses" },
  "GET /api/v2/cap0/progress": { request: "Cap0ControllerProgress1Data", response: "Cap0ControllerProgress1Responses" },
  "GET /api/v2/cap1/progress": { request: "Cap1ControllerProgress1Data", response: "Cap1ControllerProgress1Responses" },
  "GET /api/v2/cap1/trades": { request: "Cap1ControllerTrades1Data", response: "Cap1ControllerTrades1Responses" },
  "GET /api/v2/cap2/alerts/active": { request: "Cap2ControllerActive1Data", response: "Cap2ControllerActive1Responses" },
  "GET /api/v2/cap2/analysis": { request: "Cap2ControllerAnalysis1Data", response: "Cap2ControllerAnalysis1Responses" },
  "GET /api/v2/cap2/diem-ky-luat": { request: "Cap2ControllerScore1Data", response: "Cap2ControllerScore1Responses" },
  "GET /api/v2/cap2/diem-ky-luat/history": { request: "Cap2ControllerHistory1Data", response: "Cap2ControllerHistory1Responses" },
  "GET /api/v2/cap2/progress": { request: "Cap2ControllerProgress1Data", response: "Cap2ControllerProgress1Responses" },
  "GET /api/v2/cap2/trades": { request: "Cap2ControllerTrades1Data", response: "Cap2ControllerTrades1Responses" },
  "GET /api/v2/cap3/plans/{order_id}": { request: "Cap3ControllerGetPlan1Data", response: "Cap3ControllerGetPlan1Responses" },
  "GET /api/v2/cap3/progress": { request: "Cap3ControllerProgress1Data", response: "Cap3ControllerProgress1Responses" },
  "GET /api/v2/cap3/trades": { request: "Cap3ControllerTrades1Data", response: "Cap3ControllerTrades1Responses" },
  "GET /api/v2/cap3/trades/analysis": { request: "Cap3ControllerTradeAnalysis1Data", response: "Cap3ControllerTradeAnalysis1Responses" },
  "GET /api/v2/cap4/phan-tich": { request: "Cap4ControllerAnalysis1Data", response: "Cap4ControllerAnalysis1Responses" },
  "GET /api/v2/cap4/plans/{order_id}": { request: "Cap4ControllerGetPlan1Data", response: "Cap4ControllerGetPlan1Responses" },
  "GET /api/v2/cap4/progress": { request: "Cap4ControllerProgress1Data", response: "Cap4ControllerProgress1Responses" },
  "GET /api/v2/cap4/vu-khi-diem-mu": { request: "Cap4ControllerWeapons1Data", response: "Cap4ControllerWeapons1Responses" },
  "GET /api/v2/cap5/nguon-san/{symbol}": { request: "Cap5HuntSourceGetApiV2Cap5NguonSanSymbolData", response: "Cap5HuntSourceGetApiV2Cap5NguonSanSymbolResponses" },
  "GET /api/v2/cap5/phan-tich": { request: "Cap5AnalysisGetApiV2Cap5PhanTichData", response: "Cap5AnalysisGetApiV2Cap5PhanTichResponses" },
  "GET /api/v2/cap5/plans/{order_id}": { request: "Cap5PlanGetApiV2Cap5PlansOrderIdData", response: "Cap5PlanGetApiV2Cap5PlansOrderIdResponses" },
  "GET /api/v2/cap5/progress": { request: "Cap5ProgressGetApiV2Cap5ProgressData", response: "Cap5ProgressGetApiV2Cap5ProgressResponses" },
  "GET /api/v2/cap5/san-ma": { request: "Cap5HuntIndexGetApiV2Cap5SanMaData", response: "Cap5HuntIndexGetApiV2Cap5SanMaResponses" },
  "GET /api/v2/cap5/san-ma/{bo_loc}": { request: "Cap5HuntResultGetApiV2Cap5SanMaBoLocData", response: "Cap5HuntResultGetApiV2Cap5SanMaBoLocResponses" },
  "GET /api/v2/cap5/watchlist": { request: "Cap5WatchlistGetApiV2Cap5WatchlistData", response: "Cap5WatchlistGetApiV2Cap5WatchlistResponses" },
  "GET /api/v2/cap6/kehoach/{order_id}": { request: "Cap6GetPlanGetApiV2Cap6KehoachOrderIdData", response: "Cap6GetPlanGetApiV2Cap6KehoachOrderIdResponses" },
  "GET /api/v2/cap6/mau-thuan/{symbol}": { request: "Cap6ConflictGetApiV2Cap6MauThuanSymbolData", response: "Cap6ConflictGetApiV2Cap6MauThuanSymbolResponses" },
  "GET /api/v2/cap6/phan-tich": { request: "Cap6AnalysisGetApiV2Cap6PhanTichData", response: "Cap6AnalysisGetApiV2Cap6PhanTichResponses" },
  "GET /api/v2/cap6/plans/{order_id}": { request: "Cap6CumulativePlanGetApiV2Cap6PlansOrderIdData", response: "Cap6CumulativePlanGetApiV2Cap6PlansOrderIdResponses" },
  "GET /api/v2/cap6/progress": { request: "Cap6ProgressGetApiV2Cap6ProgressData", response: "Cap6ProgressGetApiV2Cap6ProgressResponses" },
  "GET /api/v2/cap7/portfolio": { request: "GetCap7PortfolioV2Data", response: "GetCap7PortfolioV2Responses" },
  "GET /api/v2/cap7/progress": { request: "GetCap7ProgressV2Data", response: "GetCap7ProgressV2Responses" },
  "GET /api/v2/cap8/positions/{symbol}/exit-context": { request: "GetCap8ExitContextV2Data", response: "GetCap8ExitContextV2Responses" },
  "GET /api/v2/cap8/progress": { request: "GetCap8ProgressV2Data", response: "GetCap8ProgressV2Responses" },
  "GET /api/v2/chart-drawings/{symbol}": { request: "GetChartDrawingV2Data", response: "GetChartDrawingV2Responses" },
  "GET /api/v2/health": { request: "LegacyHealthGetApiV2HealthData", response: "LegacyHealthGetApiV2HealthResponses" },
  "GET /api/v2/instruments": { request: "SearchInstrumentsV2Data", response: "SearchInstrumentsV2Responses" },
  "GET /api/v2/instruments/{symbol}": { request: "GetInstrumentV2Data", response: "GetInstrumentV2Responses" },
  "GET /api/v2/lessons/courses": { request: "LearningControllerCourses1Data", response: "LearningControllerCourses1Responses" },
  "GET /api/v2/lessons/courses/{slug}": { request: "LearningControllerCourse1Data", response: "LearningControllerCourse1Responses" },
  "GET /api/v2/lessons/episodes/{episodeId}/content": { request: "LearningControllerContent1Data", response: "LearningControllerContent1Responses" },
  "GET /api/v2/lessons/me/progress": { request: "LearningControllerProgress1Data", response: "LearningControllerProgress1Responses" },
  "GET /api/v2/market-analysis/{type}": { request: "ListMarketReportsV2Data", response: "ListMarketReportsV2Responses" },
  "GET /api/v2/market-analysis/{type}/{sessionDate}": { request: "GetMarketReportByDateV2Data", response: "GetMarketReportByDateV2Responses" },
  "GET /api/v2/market-analysis/{type}/latest": { request: "GetMarketReportLatestV2Data", response: "GetMarketReportLatestV2Responses" },
  "GET /api/v2/market-data/bctc-dashboard/{symbol}": { request: "GetBctcDashboardGetApiV2MarketDataBctcDashboardSymbolData", response: "GetBctcDashboardGetApiV2MarketDataBctcDashboardSymbolResponses" },
  "GET /api/v2/market-data/bctc/{symbol}": { request: "GetBctcGetApiV2MarketDataBctcSymbolData", response: "GetBctcGetApiV2MarketDataBctcSymbolResponses" },
  "GET /api/v2/market-data/company/{symbol}/bctc": { request: "GetBctcGetApiV2MarketDataCompanySymbolBctcData", response: "GetBctcGetApiV2MarketDataCompanySymbolBctcResponses" },
  "GET /api/v2/market-data/company/{symbol}/bctc-dashboard": { request: "GetBctcDashboardGetApiV2MarketDataCompanySymbolBctcDashboardData", response: "GetBctcDashboardGetApiV2MarketDataCompanySymbolBctcDashboardResponses" },
  "GET /api/v2/market-data/company/{symbol}/details": { request: "MarketDataControllerDetails1Data", response: "MarketDataControllerDetails1Responses" },
  "GET /api/v2/market-data/company/{symbol}/news": { request: "MarketDataControllerNews1Data", response: "MarketDataControllerNews1Responses" },
  "GET /api/v2/market-data/company/{symbol}/officers": { request: "MarketDataControllerOfficers1Data", response: "MarketDataControllerOfficers1Responses" },
  "GET /api/v2/market-data/company/{symbol}/overview": { request: "MarketDataControllerOverview1Data", response: "MarketDataControllerOverview1Responses" },
  "GET /api/v2/market-data/company/{symbol}/price-chart": { request: "MarketDataControllerPriceChart1Data", response: "MarketDataControllerPriceChart1Responses" },
  "GET /api/v2/market-data/company/{symbol}/shareholders": { request: "MarketDataControllerShareholders1Data", response: "MarketDataControllerShareholders1Responses" },
  "GET /api/v2/market-data/company/{symbol}/subsidiaries": { request: "MarketDataControllerSubsidiaries1Data", response: "MarketDataControllerSubsidiaries1Responses" },
  "GET /api/v2/market-data/events/calendar": { request: "MarketDataControllerEvents1Data", response: "MarketDataControllerEvents1Responses" },
  "GET /api/v2/market-data/fundamentals/{symbol}/{reportType}": { request: "MarketDataControllerFinancial1Data", response: "MarketDataControllerFinancial1Responses" },
  "GET /api/v2/market-data/funds": { request: "MarketExtendedControllerFunds1Data", response: "MarketExtendedControllerFunds1Responses" },
  "GET /api/v2/market-data/funds/{fundId}": { request: "MarketExtendedControllerFundDetails1Data", response: "MarketExtendedControllerFundDetails1Responses" },
  "GET /api/v2/market-data/funds/{fundId}/nav": { request: "MarketExtendedControllerFundNav1Data", response: "MarketExtendedControllerFundNav1Responses" },
  "GET /api/v2/market-data/global/crypto/{symbol}/depth": { request: "MarketExtendedControllerCryptoDepth1Data", response: "MarketExtendedControllerCryptoDepth1Responses" },
  "GET /api/v2/market-data/global/crypto/{symbol}/ohlc": { request: "MarketExtendedControllerCryptoOhlc1Data", response: "MarketExtendedControllerCryptoOhlc1Responses" },
  "GET /api/v2/market-data/global/crypto/{symbol}/ticker": { request: "MarketExtendedControllerCryptoTicker1Data", response: "MarketExtendedControllerCryptoTicker1Responses" },
  "GET /api/v2/market-data/global/forex": { request: "MarketExtendedControllerForex1Data", response: "MarketExtendedControllerForex1Responses" },
  "GET /api/v2/market-data/global/snapshot": { request: "MarketExtendedControllerSnapshot1Data", response: "MarketExtendedControllerSnapshot1Responses" },
  "GET /api/v2/market-data/global/world-index": { request: "MarketExtendedControllerWorldIndex1Data", response: "MarketExtendedControllerWorldIndex1Responses" },
  "GET /api/v2/market-data/insights/ranking/{kind}": { request: "MarketDataControllerRanking1Data", response: "MarketDataControllerRanking1Responses" },
  "GET /api/v2/market-data/macro/commodities": { request: "MarketExtendedControllerCommodities1Data", response: "MarketExtendedControllerCommodities1Responses" },
  "GET /api/v2/market-data/macro/commodities/{code}": { request: "MarketExtendedControllerCommodity1Data", response: "MarketExtendedControllerCommodity1Responses" },
  "GET /api/v2/market-data/macro/economy/{indicator}": { request: "MarketExtendedControllerMacro1Data", response: "MarketExtendedControllerMacro1Responses" },
  "GET /api/v2/market-data/macro/fx": { request: "MarketExtendedControllerFx1Data", response: "MarketExtendedControllerFx1Responses" },
  "GET /api/v2/market-data/macro/gold": { request: "MarketExtendedControllerGold1Data", response: "MarketExtendedControllerGold1Responses" },
  "GET /api/v2/market-data/news/ai": { request: "MarketExtendedControllerAiNews1Data", response: "MarketExtendedControllerAiNews1Responses" },
  "GET /api/v2/market-data/news/ai/audio/{newsId}": { request: "MarketExtendedControllerAiAudio1Data", response: "MarketExtendedControllerAiAudio1Responses" },
  "GET /api/v2/market-data/news/ai/catalogs": { request: "MarketExtendedControllerAiCatalogs1Data", response: "MarketExtendedControllerAiCatalogs1Responses" },
  "GET /api/v2/market-data/news/ai/detail/{slug}": { request: "MarketExtendedControllerAiDetail1Data", response: "MarketExtendedControllerAiDetail1Responses" },
  "GET /api/v2/market-data/news/ai/tickers/{symbol}": { request: "MarketExtendedControllerAiTicker1Data", response: "MarketExtendedControllerAiTicker1Responses" },
  "GET /api/v2/market-data/news/latest": { request: "MarketExtendedControllerLatestNews1Data", response: "MarketExtendedControllerLatestNews1Responses" },
  "GET /api/v2/market-data/news/sources": { request: "MarketExtendedControllerNewsSources1Data", response: "MarketExtendedControllerNewsSources1Responses" },
  "GET /api/v2/market-data/overview/allocation": { request: "MarketExtendedControllerAllocation1Data", response: "MarketExtendedControllerAllocation1Responses" },
  "GET /api/v2/market-data/overview/breadth": { request: "MarketExtendedControllerBreadth1Data", response: "MarketExtendedControllerBreadth1Responses" },
  "GET /api/v2/market-data/overview/foreign": { request: "MarketExtendedControllerForeign1Data", response: "MarketExtendedControllerForeign1Responses" },
  "GET /api/v2/market-data/overview/foreign/top": { request: "MarketExtendedControllerForeignTop1Data", response: "MarketExtendedControllerForeignTop1Responses" },
  "GET /api/v2/market-data/overview/heatmap": { request: "MarketExtendedControllerHeatmap1Data", response: "MarketExtendedControllerHeatmap1Responses" },
  "GET /api/v2/market-data/overview/heatmap/index": { request: "MarketExtendedControllerHeatmapIndex1Data", response: "MarketExtendedControllerHeatmapIndex1Responses" },
  "GET /api/v2/market-data/overview/index-impact": { request: "MarketExtendedControllerIndexImpact1Data", response: "MarketExtendedControllerIndexImpact1Responses" },
  "GET /api/v2/market-data/overview/liquidity": { request: "MarketExtendedControllerLiquidity1Data", response: "MarketExtendedControllerLiquidity1Responses" },
  "GET /api/v2/market-data/overview/maintenance": { request: "MarketExtendedControllerMaintenance1Data", response: "MarketExtendedControllerMaintenance1Responses" },
  "GET /api/v2/market-data/overview/market-index": { request: "MarketExtendedControllerMarketIndex1Data", response: "MarketExtendedControllerMarketIndex1Responses" },
  "GET /api/v2/market-data/overview/proprietary": { request: "MarketExtendedControllerProprietary1Data", response: "MarketExtendedControllerProprietary1Responses" },
  "GET /api/v2/market-data/overview/proprietary/top": { request: "MarketExtendedControllerProprietaryTop1Data", response: "MarketExtendedControllerProprietaryTop1Responses" },
  "GET /api/v2/market-data/overview/sectors/allocation": { request: "MarketExtendedControllerSectorsAllocation1Data", response: "MarketExtendedControllerSectorsAllocation1Responses" },
  "GET /api/v2/market-data/overview/sectors/detail": { request: "MarketExtendedControllerSectorDetail1Data", response: "MarketExtendedControllerSectorDetail1Responses" },
  "GET /api/v2/market-data/overview/stock-strength": { request: "MarketExtendedControllerStockStrength1Data", response: "MarketExtendedControllerStockStrength1Responses" },
  "GET /api/v2/market-data/overview/valuation": { request: "MarketExtendedControllerValuation1Data", response: "MarketExtendedControllerValuation1Responses" },
  "GET /api/v2/market-data/quotes/{symbol}/intraday": { request: "MarketDataControllerIntraday1Data", response: "MarketDataControllerIntraday1Responses" },
  "GET /api/v2/market-data/quotes/{symbol}/ohlcv": { request: "MarketDataControllerOhlcv1Data", response: "MarketDataControllerOhlcv1Responses" },
  "GET /api/v2/market-data/quotes/{symbol}/price-depth": { request: "MarketDataControllerPriceDepth1Data", response: "MarketDataControllerPriceDepth1Responses" },
  "GET /api/v2/market-data/reference/event-codes": { request: "MarketExtendedControllerEventCodes1Data", response: "MarketExtendedControllerEventCodes1Responses" },
  "GET /api/v2/market-data/reference/groups/{group}/symbols": { request: "MarketDataControllerGroupSymbols1Data", response: "MarketDataControllerGroupSymbols1Responses" },
  "GET /api/v2/market-data/reference/indices": { request: "MarketDataControllerIndices1Data", response: "MarketDataControllerIndices1Responses" },
  "GET /api/v2/market-data/reference/industries": { request: "MarketDataControllerIndustries1Data", response: "MarketDataControllerIndustries1Responses" },
  "GET /api/v2/market-data/reference/search": { request: "MarketExtendedControllerSearch1Data", response: "MarketExtendedControllerSearch1Responses" },
  "GET /api/v2/market-data/reference/symbols": { request: "MarketDataControllerSymbols1Data", response: "MarketDataControllerSymbols1Responses" },
  "GET /api/v2/market-data/screening/criteria": { request: "MarketExtendedControllerScreeningCriteria1Data", response: "MarketExtendedControllerScreeningCriteria1Responses" },
  "GET /api/v2/market-data/screening/presets": { request: "MarketExtendedControllerScreeningPresets1Data", response: "MarketExtendedControllerScreeningPresets1Responses" },
  "GET /api/v2/market-data/sectors/information": { request: "MarketExtendedControllerSectorInformation1Data", response: "MarketExtendedControllerSectorInformation1Responses" },
  "GET /api/v2/market-data/sectors/ranking": { request: "MarketExtendedControllerSectorRanking1Data", response: "MarketExtendedControllerSectorRanking1Responses" },
  "GET /api/v2/market-data/sectors/trading-dates": { request: "MarketExtendedControllerTradingDates1Data", response: "MarketExtendedControllerTradingDates1Responses" },
  "GET /api/v2/market-data/sheets/tpcp": { request: "MarketExtendedControllerSheetTpcp1Data", response: "MarketExtendedControllerSheetTpcp1Responses" },
  "GET /api/v2/market-data/sheets/tygia": { request: "MarketExtendedControllerSheetTygia1Data", response: "MarketExtendedControllerSheetTygia1Responses" },
  "GET /api/v2/market-data/sheets/vnd": { request: "MarketExtendedControllerSheetVnd1Data", response: "MarketExtendedControllerSheetVnd1Responses" },
  "GET /api/v2/market-data/trading/{symbol}/foreign-trade": { request: "MarketDataControllerForeignTrade1Data", response: "MarketDataControllerForeignTrade1Responses" },
  "GET /api/v2/market-data/trading/{symbol}/foreign-trade/summary": { request: "MarketDataControllerForeignSummary1Data", response: "MarketDataControllerForeignSummary1Responses" },
  "GET /api/v2/market-data/trading/{symbol}/history": { request: "MarketDataControllerHistory1Data", response: "MarketDataControllerHistory1Responses" },
  "GET /api/v2/market-data/trading/{symbol}/insider-deals": { request: "MarketDataControllerInsiderDeals1Data", response: "MarketDataControllerInsiderDeals1Responses" },
  "GET /api/v2/market-data/trading/{symbol}/proprietary": { request: "MarketDataControllerProprietary1Data", response: "MarketDataControllerProprietary1Responses" },
  "GET /api/v2/market-data/trading/{symbol}/proprietary/summary": { request: "MarketDataControllerProprietarySummary1Data", response: "MarketDataControllerProprietarySummary1Responses" },
  "GET /api/v2/market-data/trading/{symbol}/summary": { request: "MarketDataControllerSummary1Data", response: "MarketDataControllerSummary1Responses" },
  "GET /api/v2/market-data/trading/{symbol}/supply-demand": { request: "MarketDataControllerSupply1Data", response: "MarketDataControllerSupply1Responses" },
  "GET /api/v2/market-data/trading/{symbol}/supply-demand/summary": { request: "MarketDataControllerSupplySummary1Data", response: "MarketDataControllerSupplySummary1Responses" },
  "GET /api/v2/media/{token}": { request: "MediaControllerDownloadData", response: "MediaControllerDownloadResponses" },
  "GET /api/v2/portfolio-manager/report": { request: "GetPortfolioReportV2Data", response: "GetPortfolioReportV2Responses" },
  "GET /api/v2/premium/admin/plans": { request: "AdminListPremiumPlansGetApiV2PremiumAdminPlansData", response: "AdminListPremiumPlansGetApiV2PremiumAdminPlansResponses" },
  "GET /api/v2/premium/me": { request: "GetMyPremiumSubscriptionGetApiV2PremiumMeData", response: "GetMyPremiumSubscriptionGetApiV2PremiumMeResponses" },
  "GET /api/v2/premium/my-orders": { request: "ListMyPremiumOrdersGetApiV2PremiumMyOrdersData", response: "ListMyPremiumOrdersGetApiV2PremiumMyOrdersResponses" },
  "GET /api/v2/premium/plans": { request: "ListPremiumPlansGetApiV2PremiumPlansData", response: "ListPremiumPlansGetApiV2PremiumPlansResponses" },
  "GET /api/v2/users": { request: "UsersControllerList1Data", response: "UsersControllerList1Responses" },
  "GET /api/v2/users/{userId}": { request: "UsersControllerGet1Data", response: "UsersControllerGet1Responses" },
  "GET /api/v2/users/me": { request: "UsersControllerMe1Data", response: "UsersControllerMe1Responses" },
  "GET /api/v2/virtual-trading/account": { request: "TradingControllerAccount1Data", response: "TradingControllerAccount1Responses" },
  "GET /api/v2/virtual-trading/admin/accounts": { request: "LegacyVirtualTradingAdminControllerAccounts1Data", response: "LegacyVirtualTradingAdminControllerAccounts1Responses" },
  "GET /api/v2/virtual-trading/admin/config": { request: "LegacyVirtualTradingAdminControllerConfig1Data", response: "LegacyVirtualTradingAdminControllerConfig1Responses" },
  "GET /api/v2/virtual-trading/leaderboard": { request: "TradingControllerLeaderboard1Data", response: "TradingControllerLeaderboard1Responses" },
  "GET /api/v2/virtual-trading/ledger": { request: "TradingControllerLedger1Data", response: "TradingControllerLedger1Responses" },
  "GET /api/v2/virtual-trading/orders": { request: "TradingControllerOrders1Data", response: "TradingControllerOrders1Responses" },
  "GET /api/v2/virtual-trading/portfolio": { request: "TradingControllerPortfolio1Data", response: "TradingControllerPortfolio1Responses" },
  "GET /api/v2/virtual-trading/trades": { request: "TradingControllerTrades1Data", response: "TradingControllerTrades1Responses" },
  "GET /api/v2/watchlists": { request: "ListWatchlistV2Data", response: "ListWatchlistV2Responses" },
  "GET /api/v2/watchlists/{symbol}/status": { request: "CheckWatchlistItemV2Data", response: "CheckWatchlistItemV2Responses" },
  "PATCH /api/v2/admin/lessons/courses/{courseId}": { request: "AdminLearningControllerUpdateCourse1Data", response: "AdminLearningControllerUpdateCourse1Responses" },
  "PATCH /api/v2/admin/lessons/episodes/{episodeId}": { request: "AdminLearningControllerUpdateEpisode1Data", response: "AdminLearningControllerUpdateEpisode1Responses" },
  "PATCH /api/v2/admin/vt/config": { request: "AdminVtControllerUpdateConfig1Data", response: "AdminVtControllerUpdateConfig1Responses" },
  "PATCH /api/v2/cap0/task": { request: "Cap0ControllerTask1Data", response: "Cap0ControllerTask1Responses" },
  "PATCH /api/v2/cap1/task": { request: "Cap1ControllerTask1Data", response: "Cap1ControllerTask1Responses" },
  "PATCH /api/v2/cap2/task": { request: "Cap2ControllerTask1Data", response: "Cap2ControllerTask1Responses" },
  "PATCH /api/v2/cap3/task": { request: "Cap3ControllerTask1Data", response: "Cap3ControllerTask1Responses" },
  "PATCH /api/v2/cap4/task": { request: "Cap4ControllerTask1Data", response: "Cap4ControllerTask1Responses" },
  "PATCH /api/v2/cap5/task": { request: "Cap5TaskPatchApiV2Cap5TaskData", response: "Cap5TaskPatchApiV2Cap5TaskResponses" },
  "PATCH /api/v2/cap8/positions/{symbol}/dynamic-stop": { request: "SetCap8DynamicStopV2Data", response: "SetCap8DynamicStopV2Responses" },
  "PATCH /api/v2/premium/admin/plans/{plan_id}": { request: "AdminUpdatePremiumPlanPatchApiV2PremiumAdminPlansPlanIdData", response: "AdminUpdatePremiumPlanPatchApiV2PremiumAdminPlansPlanIdResponses" },
  "PATCH /api/v2/users/{userId}": { request: "UsersControllerUpdate1Data", response: "UsersControllerUpdate1Responses" },
  "PATCH /api/v2/users/me": { request: "UsersControllerUpdateMe1Data", response: "UsersControllerUpdateMe1Responses" },
  "PATCH /api/v2/virtual-trading/admin/config": { request: "LegacyVirtualTradingAdminControllerUpdateConfig1Data", response: "LegacyVirtualTradingAdminControllerUpdateConfig1Responses" },
  "POST /api/v2/admin/alerts/seed": { request: "AdminAlertsControllerSeed1Data", response: "AdminAlertsControllerSeed1Responses" },
  "POST /api/v2/admin/alerts/signals": { request: "AdminAlertsControllerCreate1Data", response: "AdminAlertsControllerCreate1Responses" },
  "POST /api/v2/admin/alerts/telegram/webhook": { request: "AdminAlertsControllerSetupTelegramWebhook1Data", response: "AdminAlertsControllerSetupTelegramWebhook1Responses" },
  "POST /api/v2/admin/ipn/{log_id}/retry": { request: "AdminRetryIpnPostApiV2AdminIpnLogIdRetryData", response: "AdminRetryIpnPostApiV2AdminIpnLogIdRetryResponses" },
  "POST /api/v2/admin/journey/identity/qa-grants": { request: "JourneyIdentityControllerGrantQa1Data", response: "JourneyIdentityControllerGrantQa1Responses" },
  "POST /api/v2/admin/lessons/courses": { request: "AdminLearningControllerCreateCourse1Data", response: "AdminLearningControllerCreateCourse1Responses" },
  "POST /api/v2/admin/lessons/courses/{courseId}/episodes": { request: "AdminLearningControllerCreateEpisode1Data", response: "AdminLearningControllerCreateEpisode1Responses" },
  "POST /api/v2/admin/lessons/courses/{courseId}/reorder": { request: "AdminLearningControllerReorder1Data", response: "AdminLearningControllerReorder1Responses" },
  "POST /api/v2/admin/lessons/courses/{courseId}/thumbnail": { request: "AdminLearningControllerThumbnail1Data", response: "AdminLearningControllerThumbnail1Responses" },
  "POST /api/v2/admin/lessons/episodes/{episodeId}/file": { request: "AdminLearningControllerEpisodeFile1Data", response: "AdminLearningControllerEpisodeFile1Responses" },
  "POST /api/v2/admin/payments/{order_id}/mark-paid": { request: "AdminMarkPaymentPaidPostApiV2AdminPaymentsOrderIdMarkPaidData", response: "AdminMarkPaymentPaidPostApiV2AdminPaymentsOrderIdMarkPaidResponses" },
  "POST /api/v2/admin/payments/{order_id}/reconcile": { request: "AdminReconcilePaymentPostApiV2AdminPaymentsOrderIdReconcileData", response: "AdminReconcilePaymentPostApiV2AdminPaymentsOrderIdReconcileResponses" },
  "POST /api/v2/admin/payments/{order_id}/refund": { request: "AdminRefundPaymentPostApiV2AdminPaymentsOrderIdRefundData", response: "AdminRefundPaymentPostApiV2AdminPaymentsOrderIdRefundResponses" },
  "POST /api/v2/admin/subscriptions/{sub_id}/cancel": { request: "AdminCancelSubscriptionPostApiV2AdminSubscriptionsSubIdCancelData", response: "AdminCancelSubscriptionPostApiV2AdminSubscriptionsSubIdCancelResponses" },
  "POST /api/v2/admin/subscriptions/{sub_id}/extend": { request: "AdminExtendSubscriptionPostApiV2AdminSubscriptionsSubIdExtendData", response: "AdminExtendSubscriptionPostApiV2AdminSubscriptionsSubIdExtendResponses" },
  "POST /api/v2/admin/system/jobs/{jobId}/run": { request: "AdminSystemControllerRun1Data", response: "AdminSystemControllerRun1Responses" },
  "POST /api/v2/admin/users/{userId}/resend-verification": { request: "AdminUsersControllerResendVerification1Data", response: "AdminUsersControllerResendVerification1Responses" },
  "POST /api/v2/admin/users/{userId}/reset-password": { request: "AdminUsersControllerResetPassword1Data", response: "AdminUsersControllerResetPassword1Responses" },
  "POST /api/v2/admin/users/bulk": { request: "AdminUsersControllerBulk1Data", response: "AdminUsersControllerBulk1Responses" },
  "POST /api/v2/admin/vt/accounts/{accountId}/cash-adjust": { request: "AdminVtControllerCashAdjust1Data", response: "AdminVtControllerCashAdjust1Responses" },
  "POST /api/v2/admin/vt/accounts/{accountId}/freeze": { request: "AdminVtControllerFreeze1Data", response: "AdminVtControllerFreeze1Responses" },
  "POST /api/v2/admin/vt/accounts/{accountId}/reset": { request: "AdminVtControllerReset1Data", response: "AdminVtControllerReset1Responses" },
  "POST /api/v2/admin/vt/accounts/{accountId}/unfreeze": { request: "AdminVtControllerUnfreeze1Data", response: "AdminVtControllerUnfreeze1Responses" },
  "POST /api/v2/admin/vt/reset-all": { request: "AdminVtControllerResetAll1Data", response: "AdminVtControllerResetAll1Responses" },
  "POST /api/v2/ai/dashboard/analyze": { request: "AnalyzeDashboardV2PostApiV2AiDashboardAnalyzeData", response: "AnalyzeDashboardV2PostApiV2AiDashboardAnalyzeResponses" },
  "POST /api/v2/ai/industry/analyze": { request: "AnalyzeIndustryV2PostApiV2AiIndustryAnalyzeData", response: "AnalyzeIndustryV2PostApiV2AiIndustryAnalyzeResponses" },
  "POST /api/v2/ai/industry/analyze-batch": { request: "AnalyzeIndustryBatchV2PostApiV2AiIndustryAnalyzeBatchData", response: "AnalyzeIndustryBatchV2PostApiV2AiIndustryAnalyzeBatchResponses" },
  "POST /api/v2/ai/insight/analyze": { request: "AnalyzeInsightV2PostApiV2AiInsightAnalyzeData", response: "AnalyzeInsightV2PostApiV2AiInsightAnalyzeResponses" },
  "POST /api/v2/alerts/rules": { request: "AlertsControllerCreateRule1Data", response: "AlertsControllerCreateRule1Responses" },
  "POST /api/v2/alerts/telegram/link": { request: "AlertsControllerCreateTelegramLink1Data", response: "AlertsControllerCreateTelegramLink1Responses" },
  "POST /api/v2/auth/forgot-password": { request: "AuthControllerForgotPassword1Data", response: "AuthControllerForgotPassword1Responses" },
  "POST /api/v2/auth/login": { request: "AuthControllerLogin1Data", response: "AuthControllerLogin1Responses" },
  "POST /api/v2/auth/logout": { request: "AuthControllerLogout1Data", response: "AuthControllerLogout1Responses" },
  "POST /api/v2/auth/refresh": { request: "AuthControllerRefresh1Data", response: "AuthControllerRefresh1Responses" },
  "POST /api/v2/auth/register": { request: "AuthControllerRegister1Data", response: "AuthControllerRegister1Responses" },
  "POST /api/v2/auth/reset-password": { request: "AuthControllerResetPassword1Data", response: "AuthControllerResetPassword1Responses" },
  "POST /api/v2/backtest/run": { request: "QuantControllerRun0Data", response: "QuantControllerRun0Responses" },
  "POST /api/v2/backtest/strategies": { request: "QuantControllerCreate0Data", response: "QuantControllerCreate0Responses" },
  "POST /api/v2/bot/mascot/ui-events": { request: "JourneyIdentityControllerUiEvent1Data", response: "JourneyIdentityControllerUiEvent1Responses" },
  "POST /api/v2/cap0/enter": { request: "Cap0ControllerEnter1Data", response: "Cap0ControllerEnter1Responses" },
  "POST /api/v2/cap0/graduate": { request: "Cap0ControllerGraduate1Data", response: "Cap0ControllerGraduate1Responses" },
  "POST /api/v2/cap0/kehoach": { request: "Cap0ControllerKehoach1Data", response: "Cap0ControllerKehoach1Responses" },
  "POST /api/v2/cap0/placement": { request: "Cap0ControllerPlacement1Data", response: "Cap0ControllerPlacement1Responses" },
  "POST /api/v2/cap0/tours/{tour}/complete": { request: "Cap0ControllerCompleteTour1Data", response: "Cap0ControllerCompleteTour1Responses" },
  "POST /api/v2/cap1/enter": { request: "Cap1ControllerEnter1Data", response: "Cap1ControllerEnter1Responses" },
  "POST /api/v2/cap1/graduate": { request: "Cap1ControllerGraduate1Data", response: "Cap1ControllerGraduate1Responses" },
  "POST /api/v2/cap1/kehoach": { request: "Cap1ControllerKehoach1Data", response: "Cap1ControllerKehoach1Responses" },
  "POST /api/v2/cap1/ketso": { request: "Cap1ControllerKetso1Data", response: "Cap1ControllerKetso1Responses" },
  "POST /api/v2/cap2/alerts/{alert_id}/action": { request: "Cap2ControllerAction1Data", response: "Cap2ControllerAction1Responses" },
  "POST /api/v2/cap2/alerts/{alert_id}/check": { request: "Cap2ControllerCheck1Data", response: "Cap2ControllerCheck1Responses" },
  "POST /api/v2/cap2/alerts/{alert_id}/claim": { request: "Cap2ControllerClaim1Data", response: "Cap2ControllerClaim1Responses" },
  "POST /api/v2/cap2/alerts/{alert_id}/dismiss": { request: "Cap2ControllerDismiss1Data", response: "Cap2ControllerDismiss1Responses" },
  "POST /api/v2/cap2/alerts/{alert_id}/snooze": { request: "Cap2ControllerSnooze1Data", response: "Cap2ControllerSnooze1Responses" },
  "POST /api/v2/cap2/alerts/pre-buy": { request: "Cap2ControllerPreBuy1Data", response: "Cap2ControllerPreBuy1Responses" },
  "POST /api/v2/cap2/enter": { request: "Cap2ControllerEnter1Data", response: "Cap2ControllerEnter1Responses" },
  "POST /api/v2/cap2/graduate": { request: "Cap2ControllerGraduate1Data", response: "Cap2ControllerGraduate1Responses" },
  "POST /api/v2/cap2/kehoach": { request: "Cap2ControllerKehoach1Data", response: "Cap2ControllerKehoach1Responses" },
  "POST /api/v2/cap2/ketso": { request: "Cap2ControllerKetso1Data", response: "Cap2ControllerKetso1Responses" },
  "POST /api/v2/cap3/enter": { request: "Cap3ControllerEnter1Data", response: "Cap3ControllerEnter1Responses" },
  "POST /api/v2/cap3/graduate": { request: "Cap3ControllerGraduate1Data", response: "Cap3ControllerGraduate1Responses" },
  "POST /api/v2/cap3/kehoach": { request: "Cap3ControllerPlan1Data", response: "Cap3ControllerPlan1Responses" },
  "POST /api/v2/cap3/khau-vi": { request: "Cap3ControllerRisk1Data", response: "Cap3ControllerRisk1Responses" },
  "POST /api/v2/cap4/enter": { request: "Cap4ControllerEnter1Data", response: "Cap4ControllerEnter1Responses" },
  "POST /api/v2/cap4/graduate": { request: "Cap4ControllerGraduate1Data", response: "Cap4ControllerGraduate1Responses" },
  "POST /api/v2/cap4/kehoach": { request: "Cap4ControllerPlan1Data", response: "Cap4ControllerPlan1Responses" },
  "POST /api/v2/cap5/enter": { request: "Cap5EnterPostApiV2Cap5EnterData", response: "Cap5EnterPostApiV2Cap5EnterResponses" },
  "POST /api/v2/cap5/graduate": { request: "Cap5GraduatePostApiV2Cap5GraduateData", response: "Cap5GraduatePostApiV2Cap5GraduateResponses" },
  "POST /api/v2/cap5/tour-sanma": { request: "Cap5TourSanmaPostApiV2Cap5TourSanmaData", response: "Cap5TourSanmaPostApiV2Cap5TourSanmaResponses" },
  "POST /api/v2/cap5/watchlist": { request: "Cap5AddWatchlistPostApiV2Cap5WatchlistData", response: "Cap5AddWatchlistPostApiV2Cap5WatchlistResponses" },
  "POST /api/v2/cap6/enter": { request: "Cap6EnterPostApiV2Cap6EnterData", response: "Cap6EnterPostApiV2Cap6EnterResponses" },
  "POST /api/v2/cap6/graduate": { request: "Cap6GraduatePostApiV2Cap6GraduateData", response: "Cap6GraduatePostApiV2Cap6GraduateResponses" },
  "POST /api/v2/cap6/kehoach": { request: "Cap6RecordPlanPostApiV2Cap6KehoachData", response: "Cap6RecordPlanPostApiV2Cap6KehoachResponses" },
  "POST /api/v2/cap6/skip": { request: "Cap6SkipPostApiV2Cap6SkipData", response: "Cap6SkipPostApiV2Cap6SkipResponses" },
  "POST /api/v2/cap6/tour-mauthuan": { request: "Cap6TourMauThuanPostApiV2Cap6TourMauthuanData", response: "Cap6TourMauThuanPostApiV2Cap6TourMauthuanResponses" },
  "POST /api/v2/cap7/enter": { request: "EnterCap7V2Data", response: "EnterCap7V2Responses" },
  "POST /api/v2/cap7/graduate": { request: "GraduateCap7V2Data", response: "GraduateCap7V2Responses" },
  "POST /api/v2/cap8/enter": { request: "EnterCap8V2Data", response: "EnterCap8V2Responses" },
  "POST /api/v2/cap8/exits": { request: "RecordCap8ExitV2Data", response: "RecordCap8ExitV2Responses" },
  "POST /api/v2/cap8/graduate": { request: "GraduateCap8V2Data", response: "GraduateCap8V2Responses" },
  "POST /api/v2/cap8/positions/{symbol}/sync-plan": { request: "SyncCap8PlanV2Data", response: "SyncCap8PlanV2Responses" },
  "POST /api/v2/journey/assessments": { request: "JourneyIdentityControllerSubmit1Data", response: "JourneyIdentityControllerSubmit1Responses" },
  "POST /api/v2/journey/assessments/{assessmentId}/reveal": { request: "JourneyIdentityControllerReveal1Data", response: "JourneyIdentityControllerReveal1Responses" },
  "POST /api/v2/journey/events": { request: "JourneyEventControllerRecord1Data", response: "JourneyEventControllerRecord1Responses" },
  "POST /api/v2/journey/reading-datasets": { request: "JourneyIdentityControllerCreateDataset1Data", response: "JourneyIdentityControllerCreateDataset1Responses" },
  "POST /api/v2/lessons/episodes/{episodeId}/progress": { request: "LearningControllerUpdateProgress1Data", response: "LearningControllerUpdateProgress1Responses" },
  "POST /api/v2/market-analysis/{type}/run": { request: "RunMarketReportV2Data", response: "RunMarketReportV2Responses" },
  "POST /api/v2/market-data/screening/search": { request: "MarketExtendedControllerScreeningSearch1Data", response: "MarketExtendedControllerScreeningSearch1Responses" },
  "POST /api/v2/market-data/trading/price-board": { request: "MarketDataControllerPriceBoard1Data", response: "MarketDataControllerPriceBoard1Responses" },
  "POST /api/v2/portfolio-manager/analyze": { request: "AnalyzePortfolioV2Data", response: "AnalyzePortfolioV2Responses" },
  "POST /api/v2/premium/admin/plans": { request: "AdminCreatePremiumPlanPostApiV2PremiumAdminPlansData", response: "AdminCreatePremiumPlanPostApiV2PremiumAdminPlansResponses" },
  "POST /api/v2/premium/admin/users/{user_id}/grant": { request: "AdminGrantPremiumPostApiV2PremiumAdminUsersUserIdGrantData", response: "AdminGrantPremiumPostApiV2PremiumAdminUsersUserIdGrantResponses" },
  "POST /api/v2/premium/checkout": { request: "CreatePremiumCheckoutPostApiV2PremiumCheckoutData", response: "CreatePremiumCheckoutPostApiV2PremiumCheckoutResponses" },
  "POST /api/v2/premium/sepay/ipn": { request: "ReceiveSePayIpnPostApiV2PremiumSepayIpnData", response: "ReceiveSePayIpnPostApiV2PremiumSepayIpnResponses" },
  "POST /api/v2/telegram/webhook/{secret}": { request: "TelegramControllerWebhook1Data", response: "TelegramControllerWebhook1Responses" },
  "POST /api/v2/users": { request: "UsersControllerCreate1Data", response: "UsersControllerCreate1Responses" },
  "POST /api/v2/virtual-trading/account/activate": { request: "TradingControllerActivate1Data", response: "TradingControllerActivate1Responses" },
  "POST /api/v2/virtual-trading/admin/reset-all": { request: "LegacyVirtualTradingAdminControllerResetAll1Data", response: "LegacyVirtualTradingAdminControllerResetAll1Responses" },
  "POST /api/v2/virtual-trading/admin/users/{userId}/reset": { request: "LegacyVirtualTradingAdminControllerReset1Data", response: "LegacyVirtualTradingAdminControllerReset1Responses" },
  "POST /api/v2/virtual-trading/orders": { request: "TradingControllerPlace1Data", response: "TradingControllerPlace1Responses" },
  "POST /api/v2/virtual-trading/orders/{orderId}/cancel": { request: "TradingControllerCancel1Data", response: "TradingControllerCancel1Responses" },
  "POST /api/v2/virtual-trading/refresh": { request: "TradingControllerRefresh1Data", response: "TradingControllerRefresh1Responses" },
  "POST /api/v2/watchlists": { request: "AddWatchlistItemV2Data", response: "AddWatchlistItemV2Responses" },
  "PUT /api/v2/admin/alerts/signals/{key}": { request: "AdminAlertsControllerUpdate1Data", response: "AdminAlertsControllerUpdate1Responses" },
  "PUT /api/v2/alerts/rules/{ruleId}": { request: "AlertsControllerUpdateRule1Data", response: "AlertsControllerUpdateRule1Responses" },
  "PUT /api/v2/backtest/strategies/{strategyId}": { request: "QuantControllerUpdate0Data", response: "QuantControllerUpdate0Responses" },
  "PUT /api/v2/chart-drawings/{symbol}": { request: "SaveChartDrawingV2Data", response: "SaveChartDrawingV2Responses" },
  "PUT /api/v2/watchlists/reorder": { request: "ReorderWatchlistV2Data", response: "ReorderWatchlistV2Responses" },
}
