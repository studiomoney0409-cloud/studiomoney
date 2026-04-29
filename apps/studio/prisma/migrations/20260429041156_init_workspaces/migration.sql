-- Enable pgvector extension for ArticleChunk.embedding
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trendSources" JSONB NOT NULL,
    "promptHints" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'ko',
    "region" TEXT NOT NULL DEFAULT 'KR',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "niche_templates" (
    "id" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "defaultKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultSources" JSONB NOT NULL,
    "promptHints" TEXT NOT NULL,
    "defaultPersona" JSONB NOT NULL,
    "redditSubs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "iconEmoji" TEXT NOT NULL DEFAULT '📦',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "niche_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "imageDataUri" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "fontMood" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_plans" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "frequency" JSONB NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_items" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reasoning" TEXT NOT NULL DEFAULT '',
    "addedToCalendar" BOOLEAN NOT NULL DEFAULT false,
    "calendarEventId" TEXT,
    "planId" TEXT NOT NULL,

    CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mood_searches" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "imageDataUri" TEXT NOT NULL,
    "moodKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "colorPalette" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "atmosphere" TEXT NOT NULL DEFAULT '',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mood_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "category" TEXT NOT NULL DEFAULT '',
    "specJson" JSONB NOT NULL,
    "thumbnailDataUri" TEXT NOT NULL DEFAULT '',
    "planItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_reports" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "slideComposition" JSONB,
    "writingStyle" JSONB,
    "visualDesign" JSONB,
    "insights" JSONB,
    "rawAnalysis" JSONB,
    "screenshots" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "sns_accounts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "profileImageUrl" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sns_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "jobPayload" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "snsAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_imports" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "urls" TEXT[],
    "commonInstructions" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "results" JSONB,
    "generatedPostIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_personas" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creationMethod" TEXT NOT NULL,
    "sourceAccountId" TEXT,
    "perspective" TEXT NOT NULL DEFAULT '',
    "expertiseAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tone" JSONB,
    "emotionalDrivers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vocabulary" JSONB,
    "structure" JSONB,
    "contentRules" JSONB,
    "channelProfiles" JSONB,
    "goldenExamples" JSONB,
    "topicPrefs" JSONB,
    "sampleTexts" JSONB,
    "styleFingerprint" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "snsAccountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "platformPostId" TEXT,
    "platformPostUrl" TEXT,
    "content" JSONB NOT NULL,
    "personaId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_performance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "snsAccountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "hourOfDay" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autopilot_configs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "snsAccountId" TEXT NOT NULL,
    "personaId" TEXT,
    "platforms" TEXT[],
    "postsPerDay" INTEGER NOT NULL DEFAULT 1,
    "approvalMode" TEXT NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "topicKeywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "autopilot_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autopilot_proposals" (
    "id" TEXT NOT NULL,
    "autopilotConfigId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publicationId" TEXT,
    "personaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "autopilot_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incoming_messages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "snsAccountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "parentPostId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderHandle" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'comment',
    "body" TEXT NOT NULL,
    "classification" TEXT,
    "sentiment" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "isGoldenTime" BOOLEAN NOT NULL DEFAULT false,
    "autoReplied" BOOLEAN NOT NULL DEFAULT false,
    "autoReplyText" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "incoming_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_reply_rules" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "snsAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" TEXT NOT NULL,
    "triggerValue" TEXT NOT NULL,
    "replyTemplate" TEXT NOT NULL,
    "useAi" BOOLEAN NOT NULL DEFAULT false,
    "aiInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_reply_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_campaigns" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "snsAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[],
    "platforms" TEXT[],
    "commentMode" TEXT NOT NULL DEFAULT 'ai',
    "commentTemplate" TEXT,
    "aiInstructions" TEXT,
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "todayCount" INTEGER NOT NULL DEFAULT 0,
    "operatingStart" INTEGER NOT NULL DEFAULT 9,
    "operatingEnd" INTEGER NOT NULL DEFAULT 22,
    "minDelaySec" INTEGER NOT NULL DEFAULT 30,
    "maxDelaySec" INTEGER NOT NULL DEFAULT 300,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "tosWarningAcked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_comment_logs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "targetPostId" TEXT,
    "targetPostUrl" TEXT NOT NULL,
    "targetPostText" TEXT,
    "commentText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_comment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "snsAccountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "followersGrowth" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "engagement" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profileViews" INTEGER NOT NULL DEFAULT 0,
    "demographics" JSONB,
    "topPosts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "seoKeywords" TEXT[],
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "personaId" TEXT,
    "pipelineRunId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "coverImageUrl" TEXT,
    "visualAssets" JSONB,
    "publishedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_artists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL DEFAULT '',
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "type" TEXT NOT NULL DEFAULT 'person',
    "spotifyId" TEXT,
    "musicBrainzId" TEXT,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bio" TEXT NOT NULL DEFAULT '',
    "bioKo" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "activeFrom" TEXT,
    "activeTo" TEXT,
    "country" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_albums" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleKo" TEXT NOT NULL DEFAULT '',
    "artistId" TEXT NOT NULL,
    "spotifyId" TEXT,
    "musicBrainzId" TEXT,
    "releaseDate" TEXT,
    "albumType" TEXT NOT NULL DEFAULT 'album',
    "totalTracks" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL DEFAULT '',
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "avgDanceability" DOUBLE PRECISION,
    "avgEnergy" DOUBLE PRECISION,
    "avgValence" DOUBLE PRECISION,
    "avgTempo" DOUBLE PRECISION,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "spotifyId" TEXT,
    "trackNumber" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "previewUrl" TEXT,
    "danceability" DOUBLE PRECISION,
    "energy" DOUBLE PRECISION,
    "valence" DOUBLE PRECISION,
    "tempo" DOUBLE PRECISION,
    "acousticness" DOUBLE PRECISION,
    "instrumentalness" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_relations" (
    "id" TEXT NOT NULL,
    "fromArtistId" TEXT NOT NULL,
    "toArtistId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source" TEXT NOT NULL DEFAULT 'spotify',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_genres" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL DEFAULT '',
    "parentGenre" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_chunks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "personaId" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entityMentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "rank" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_performance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "avgEngagement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastPublishedAt" TIMESTAMP(3),
    "coolingUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_memory_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tokenJson" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "artistName" TEXT NOT NULL DEFAULT '',
    "albumName" TEXT NOT NULL DEFAULT '',
    "spotifyArtistId" TEXT NOT NULL DEFAULT '',
    "spotifyAlbumId" TEXT NOT NULL DEFAULT '',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_memory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_quality_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "scoresJson" JSONB NOT NULL,
    "averageScore" DOUBLE PRECISION NOT NULL,
    "verdict" TEXT NOT NULL,
    "iterationCount" INTEGER NOT NULL DEFAULT 1,
    "designPath" TEXT NOT NULL,
    "generationTimeMs" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_quality_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_performance_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "templateId" TEXT,
    "designPath" TEXT NOT NULL,
    "typographyMood" TEXT,
    "layoutStyle" TEXT,
    "colorMood" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "slideCount" INTEGER NOT NULL DEFAULT 1,
    "impressions" INTEGER,
    "engagements" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,
    "clicks" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_performance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_usage_logs" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "caller" TEXT NOT NULL,
    "durationMs" INTEGER,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "angle" TEXT NOT NULL DEFAULT '',
    "contentType" TEXT NOT NULL DEFAULT 'blog',
    "personaId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "outlineJson" JSONB,
    "researchJson" JSONB,
    "draftContent" TEXT,
    "editedContent" TEXT,
    "qualityScore" JSONB,
    "rewriteCount" INTEGER NOT NULL DEFAULT 0,
    "publicationId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "metrics1h" JSONB,
    "metrics24h" JSONB,
    "metrics7d" JSONB,
    "metrics30d" JSONB,
    "engagementRate" DOUBLE PRECISION,
    "contentQualityRatio" DOUBLE PRECISION,
    "feedbackStatus" TEXT NOT NULL DEFAULT 'pending',
    "feedbackProcessedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_drafts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "angle" TEXT NOT NULL DEFAULT '',
    "reasoning" TEXT NOT NULL DEFAULT '',
    "contentType" TEXT NOT NULL DEFAULT 'blog',
    "status" TEXT NOT NULL DEFAULT 'saved',
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "sourceData" JSONB,
    "trendSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedEntities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "formats" JSONB,
    "personaId" TEXT,
    "pipelineRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_messages" (
    "id" TEXT NOT NULL,
    "topicDraftId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "topicUpdate" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_gen_history" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "revisedPrompt" TEXT,
    "provider" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT 'square',
    "purpose" TEXT NOT NULL DEFAULT 'general',
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_gen_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_accounts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'instagram',
    "username" TEXT NOT NULL,
    "platformUserId" TEXT,
    "displayName" TEXT NOT NULL DEFAULT '',
    "profileImageUrl" TEXT NOT NULL DEFAULT '',
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_feeds" (
    "id" TEXT NOT NULL,
    "referenceAccountId" TEXT NOT NULL,
    "platformPostId" TEXT NOT NULL,
    "postType" TEXT NOT NULL DEFAULT 'image',
    "permalink" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mentionedUsers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enrichedContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kits" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Brand Kit',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "colorPrimary" TEXT NOT NULL DEFAULT '#6C5CE7',
    "colorAccent" TEXT NOT NULL DEFAULT '#10b981',
    "colorBgDark" TEXT NOT NULL DEFAULT '#0a0a0a',
    "colorBgLight" TEXT NOT NULL DEFAULT '#f8f9fa',
    "colorText" TEXT NOT NULL DEFAULT '#1a1a1a',
    "headingFont" TEXT NOT NULL DEFAULT 'Pretendard',
    "bodyFont" TEXT NOT NULL DEFAULT 'Noto Sans KR',
    "safeMargin" INTEGER NOT NULL DEFAULT 60,
    "borderRadius" INTEGER NOT NULL DEFAULT 16,
    "logoUrl" TEXT,
    "logomarkUrl" TEXT,
    "extendedJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerRef" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'running',
    "inputJson" JSONB,
    "outputJson" JSONB,
    "errorMessage" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_logs" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_plans" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "strategyJson" JSONB NOT NULL,
    "statusJson" JSONB,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_briefings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weeklyPlanId" TEXT,
    "assignmentsJson" JSONB NOT NULL,
    "trendSummary" TEXT NOT NULL DEFAULT '',
    "statusJson" JSONB,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_gates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "articleSummary" TEXT NOT NULL DEFAULT '',
    "candidates" JSONB NOT NULL,
    "selectedUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "personaId" TEXT,
    "pipelineRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscribers" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "segments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_issues" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "subjectB" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "articleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "openRate" DOUBLE PRECISION,
    "clickRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_campaigns" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'A',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "externalBatchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_deals" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sponsorName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "dealType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'negotiating',
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "deliverables" JSONB,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsor_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_links" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "affiliateUrl" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "label" TEXT NOT NULL DEFAULT '',
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "conversionCount" INTEGER NOT NULL DEFAULT 0,
    "revenueTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "referenceId" TEXT,
    "blogPostId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "warmthScore" INTEGER NOT NULL DEFAULT 0,
    "musicArtistId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "lastContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaborations" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "description" TEXT NOT NULL DEFAULT '',
    "deliverables" JSONB,
    "blogPostIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaborations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_campaigns" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "partnerId" TEXT,
    "targetName" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "messageSubject" TEXT NOT NULL DEFAULT '',
    "messageBody" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "trendSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "workspaces_ownerId_idx" ON "workspaces"("ownerId");

-- CreateIndex
CREATE INDEX "workspaces_niche_idx" ON "workspaces"("niche");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_ownerId_slug_key" ON "workspaces"("ownerId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "niche_templates_niche_key" ON "niche_templates"("niche");

-- CreateIndex
CREATE INDEX "design_entries_workspaceId_category_idx" ON "design_entries"("workspaceId", "category");

-- CreateIndex
CREATE INDEX "calendar_events_workspaceId_date_idx" ON "calendar_events"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "content_plans_workspaceId_idx" ON "content_plans"("workspaceId");

-- CreateIndex
CREATE INDEX "plan_items_planId_idx" ON "plan_items"("planId");

-- CreateIndex
CREATE INDEX "mood_searches_workspaceId_idx" ON "mood_searches"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "design_projects_planItemId_key" ON "design_projects"("planItemId");

-- CreateIndex
CREATE INDEX "design_projects_workspaceId_status_idx" ON "design_projects"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "design_projects_planItemId_idx" ON "design_projects"("planItemId");

-- CreateIndex
CREATE INDEX "benchmark_reports_createdAt_idx" ON "benchmark_reports"("createdAt");

-- CreateIndex
CREATE INDEX "sns_accounts_workspaceId_platform_idx" ON "sns_accounts"("workspaceId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "sns_accounts_workspaceId_platform_platformUserId_key" ON "sns_accounts"("workspaceId", "platform", "platformUserId");

-- CreateIndex
CREATE INDEX "jobs_status_scheduledAt_idx" ON "jobs"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cron_schedules_name_key" ON "cron_schedules"("name");

-- CreateIndex
CREATE INDEX "webhook_events_platform_processed_idx" ON "webhook_events"("platform", "processed");

-- CreateIndex
CREATE INDEX "webhook_events_createdAt_idx" ON "webhook_events"("createdAt");

-- CreateIndex
CREATE INDEX "link_imports_workspaceId_status_idx" ON "link_imports"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "writing_personas_workspaceId_idx" ON "writing_personas"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "writing_personas_workspaceId_name_key" ON "writing_personas"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "publications_workspaceId_status_idx" ON "publications"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "publications_scheduledAt_idx" ON "publications"("scheduledAt");

-- CreateIndex
CREATE INDEX "publications_snsAccountId_idx" ON "publications"("snsAccountId");

-- CreateIndex
CREATE INDEX "publications_personaId_idx" ON "publications"("personaId");

-- CreateIndex
CREATE INDEX "post_performance_workspaceId_snsAccountId_idx" ON "post_performance"("workspaceId", "snsAccountId");

-- CreateIndex
CREATE INDEX "post_performance_publishedAt_idx" ON "post_performance"("publishedAt");

-- CreateIndex
CREATE INDEX "autopilot_configs_workspaceId_idx" ON "autopilot_configs"("workspaceId");

-- CreateIndex
CREATE INDEX "autopilot_configs_snsAccountId_idx" ON "autopilot_configs"("snsAccountId");

-- CreateIndex
CREATE INDEX "autopilot_proposals_autopilotConfigId_idx" ON "autopilot_proposals"("autopilotConfigId");

-- CreateIndex
CREATE INDEX "autopilot_proposals_status_idx" ON "autopilot_proposals"("status");

-- CreateIndex
CREATE INDEX "incoming_messages_workspaceId_snsAccountId_isRead_idx" ON "incoming_messages"("workspaceId", "snsAccountId", "isRead");

-- CreateIndex
CREATE INDEX "incoming_messages_classification_idx" ON "incoming_messages"("classification");

-- CreateIndex
CREATE UNIQUE INDEX "incoming_messages_platform_externalId_key" ON "incoming_messages"("platform", "externalId");

-- CreateIndex
CREATE INDEX "auto_reply_rules_workspaceId_snsAccountId_idx" ON "auto_reply_rules"("workspaceId", "snsAccountId");

-- CreateIndex
CREATE INDEX "keyword_campaigns_workspaceId_snsAccountId_idx" ON "keyword_campaigns"("workspaceId", "snsAccountId");

-- CreateIndex
CREATE INDEX "keyword_comment_logs_campaignId_idx" ON "keyword_comment_logs"("campaignId");

-- CreateIndex
CREATE INDEX "keyword_comment_logs_status_idx" ON "keyword_comment_logs"("status");

-- CreateIndex
CREATE INDEX "analytics_snapshots_workspaceId_snsAccountId_platform_idx" ON "analytics_snapshots"("workspaceId", "snsAccountId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_snsAccountId_date_key" ON "analytics_snapshots"("snsAccountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_pipelineRunId_key" ON "blog_posts"("pipelineRunId");

-- CreateIndex
CREATE INDEX "blog_posts_workspaceId_status_idx" ON "blog_posts"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_workspaceId_slug_key" ON "blog_posts"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "music_artists_spotifyId_key" ON "music_artists"("spotifyId");

-- CreateIndex
CREATE UNIQUE INDEX "music_artists_musicBrainzId_key" ON "music_artists"("musicBrainzId");

-- CreateIndex
CREATE INDEX "music_artists_spotifyId_idx" ON "music_artists"("spotifyId");

-- CreateIndex
CREATE INDEX "music_artists_name_idx" ON "music_artists"("name");

-- CreateIndex
CREATE UNIQUE INDEX "music_albums_spotifyId_key" ON "music_albums"("spotifyId");

-- CreateIndex
CREATE UNIQUE INDEX "music_albums_musicBrainzId_key" ON "music_albums"("musicBrainzId");

-- CreateIndex
CREATE INDEX "music_albums_artistId_idx" ON "music_albums"("artistId");

-- CreateIndex
CREATE INDEX "music_albums_releaseDate_idx" ON "music_albums"("releaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "music_tracks_spotifyId_key" ON "music_tracks"("spotifyId");

-- CreateIndex
CREATE INDEX "music_tracks_albumId_idx" ON "music_tracks"("albumId");

-- CreateIndex
CREATE INDEX "artist_relations_fromArtistId_idx" ON "artist_relations"("fromArtistId");

-- CreateIndex
CREATE INDEX "artist_relations_toArtistId_idx" ON "artist_relations"("toArtistId");

-- CreateIndex
CREATE UNIQUE INDEX "artist_relations_fromArtistId_toArtistId_relationType_key" ON "artist_relations"("fromArtistId", "toArtistId", "relationType");

-- CreateIndex
CREATE UNIQUE INDEX "music_genres_name_key" ON "music_genres"("name");

-- CreateIndex
CREATE INDEX "article_chunks_workspaceId_sourceType_idx" ON "article_chunks"("workspaceId", "sourceType");

-- CreateIndex
CREATE INDEX "article_chunks_personaId_idx" ON "article_chunks"("personaId");

-- CreateIndex
CREATE INDEX "trend_snapshots_workspaceId_source_fetchedAt_idx" ON "trend_snapshots"("workspaceId", "source", "fetchedAt");

-- CreateIndex
CREATE INDEX "trend_snapshots_title_idx" ON "trend_snapshots"("title");

-- CreateIndex
CREATE UNIQUE INDEX "topic_performance_workspaceId_topic_category_key" ON "topic_performance"("workspaceId", "topic", "category");

-- CreateIndex
CREATE INDEX "style_memory_entries_workspaceId_spotifyArtistId_idx" ON "style_memory_entries"("workspaceId", "spotifyArtistId");

-- CreateIndex
CREATE INDEX "style_memory_entries_lastAccessedAt_idx" ON "style_memory_entries"("lastAccessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "style_memory_entries_workspaceId_key_key" ON "style_memory_entries"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "design_quality_entries_designId_key" ON "design_quality_entries"("designId");

-- CreateIndex
CREATE INDEX "design_quality_entries_workspaceId_contentType_idx" ON "design_quality_entries"("workspaceId", "contentType");

-- CreateIndex
CREATE INDEX "design_quality_entries_verdict_idx" ON "design_quality_entries"("verdict");

-- CreateIndex
CREATE INDEX "design_quality_entries_createdAt_idx" ON "design_quality_entries"("createdAt");

-- CreateIndex
CREATE INDEX "style_performance_entries_workspaceId_contentType_platform_idx" ON "style_performance_entries"("workspaceId", "contentType", "platform");

-- CreateIndex
CREATE INDEX "style_performance_entries_engagementRate_idx" ON "style_performance_entries"("engagementRate");

-- CreateIndex
CREATE INDEX "style_performance_entries_createdAt_idx" ON "style_performance_entries"("createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_logs_createdAt_idx" ON "llm_usage_logs"("createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_logs_caller_idx" ON "llm_usage_logs"("caller");

-- CreateIndex
CREATE INDEX "llm_usage_logs_model_idx" ON "llm_usage_logs"("model");

-- CreateIndex
CREATE INDEX "llm_usage_logs_workspaceId_idx" ON "llm_usage_logs"("workspaceId");

-- CreateIndex
CREATE INDEX "pipeline_runs_workspaceId_status_idx" ON "pipeline_runs"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "pipeline_runs_personaId_idx" ON "pipeline_runs"("personaId");

-- CreateIndex
CREATE INDEX "pipeline_runs_contentType_idx" ON "pipeline_runs"("contentType");

-- CreateIndex
CREATE INDEX "pipeline_runs_feedbackStatus_idx" ON "pipeline_runs"("feedbackStatus");

-- CreateIndex
CREATE UNIQUE INDEX "topic_drafts_pipelineRunId_key" ON "topic_drafts"("pipelineRunId");

-- CreateIndex
CREATE INDEX "topic_drafts_workspaceId_status_idx" ON "topic_drafts"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "topic_drafts_createdAt_idx" ON "topic_drafts"("createdAt");

-- CreateIndex
CREATE INDEX "topic_messages_topicDraftId_idx" ON "topic_messages"("topicDraftId");

-- CreateIndex
CREATE INDEX "image_gen_history_workspaceId_provider_idx" ON "image_gen_history"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "image_gen_history_createdAt_idx" ON "image_gen_history"("createdAt");

-- CreateIndex
CREATE INDEX "reference_accounts_workspaceId_platform_isActive_idx" ON "reference_accounts"("workspaceId", "platform", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "reference_accounts_workspaceId_platform_username_key" ON "reference_accounts"("workspaceId", "platform", "username");

-- CreateIndex
CREATE UNIQUE INDEX "reference_feeds_platformPostId_key" ON "reference_feeds"("platformPostId");

-- CreateIndex
CREATE INDEX "reference_feeds_referenceAccountId_timestamp_idx" ON "reference_feeds"("referenceAccountId", "timestamp");

-- CreateIndex
CREATE INDEX "reference_feeds_timestamp_idx" ON "reference_feeds"("timestamp");

-- CreateIndex
CREATE INDEX "brand_kits_workspaceId_idx" ON "brand_kits"("workspaceId");

-- CreateIndex
CREATE INDEX "agent_runs_workspaceId_agentName_startedAt_idx" ON "agent_runs"("workspaceId", "agentName", "startedAt");

-- CreateIndex
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- CreateIndex
CREATE INDEX "agent_logs_agentRunId_idx" ON "agent_logs"("agentRunId");

-- CreateIndex
CREATE INDEX "weekly_plans_workspaceId_weekStart_idx" ON "weekly_plans"("workspaceId", "weekStart");

-- CreateIndex
CREATE INDEX "daily_briefings_weeklyPlanId_idx" ON "daily_briefings"("weeklyPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_briefings_workspaceId_date_key" ON "daily_briefings"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "image_gates_workspaceId_status_idx" ON "image_gates"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "image_gates_createdAt_idx" ON "image_gates"("createdAt");

-- CreateIndex
CREATE INDEX "subscribers_workspaceId_status_idx" ON "subscribers"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_workspaceId_email_key" ON "subscribers"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "newsletter_issues_workspaceId_status_idx" ON "newsletter_issues"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "newsletter_campaigns_issueId_idx" ON "newsletter_campaigns"("issueId");

-- CreateIndex
CREATE INDEX "sponsor_deals_workspaceId_status_idx" ON "sponsor_deals"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "affiliate_links_workspaceId_isActive_idx" ON "affiliate_links"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "revenue_events_workspaceId_source_eventDate_idx" ON "revenue_events"("workspaceId", "source", "eventDate");

-- CreateIndex
CREATE INDEX "revenue_events_blogPostId_idx" ON "revenue_events"("blogPostId");

-- CreateIndex
CREATE INDEX "partners_workspaceId_status_idx" ON "partners"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "partners_workspaceId_type_idx" ON "partners"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "collaborations_partnerId_idx" ON "collaborations"("partnerId");

-- CreateIndex
CREATE INDEX "collaborations_status_idx" ON "collaborations"("status");

-- CreateIndex
CREATE INDEX "outreach_campaigns_workspaceId_status_idx" ON "outreach_campaigns"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_entries" ADD CONSTRAINT "design_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "content_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mood_searches" ADD CONSTRAINT "mood_searches_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sns_accounts" ADD CONSTRAINT "sns_accounts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_imports" ADD CONSTRAINT "link_imports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_personas" ADD CONSTRAINT "writing_personas_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_performance" ADD CONSTRAINT "post_performance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autopilot_configs" ADD CONSTRAINT "autopilot_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autopilot_proposals" ADD CONSTRAINT "autopilot_proposals_autopilotConfigId_fkey" FOREIGN KEY ("autopilotConfigId") REFERENCES "autopilot_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_messages" ADD CONSTRAINT "incoming_messages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_campaigns" ADD CONSTRAINT "keyword_campaigns_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_comment_logs" ADD CONSTRAINT "keyword_comment_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "keyword_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "pipeline_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_albums" ADD CONSTRAINT "music_albums_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "music_artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "music_albums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_relations" ADD CONSTRAINT "artist_relations_fromArtistId_fkey" FOREIGN KEY ("fromArtistId") REFERENCES "music_artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_relations" ADD CONSTRAINT "artist_relations_toArtistId_fkey" FOREIGN KEY ("toArtistId") REFERENCES "music_artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_chunks" ADD CONSTRAINT "article_chunks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_snapshots" ADD CONSTRAINT "trend_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_performance" ADD CONSTRAINT "topic_performance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_memory_entries" ADD CONSTRAINT "style_memory_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_quality_entries" ADD CONSTRAINT "design_quality_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_performance_entries" ADD CONSTRAINT "style_performance_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_drafts" ADD CONSTRAINT "topic_drafts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_drafts" ADD CONSTRAINT "topic_drafts_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "pipeline_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_messages" ADD CONSTRAINT "topic_messages_topicDraftId_fkey" FOREIGN KEY ("topicDraftId") REFERENCES "topic_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_gen_history" ADD CONSTRAINT "image_gen_history_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_accounts" ADD CONSTRAINT "reference_accounts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_feeds" ADD CONSTRAINT "reference_feeds_referenceAccountId_fkey" FOREIGN KEY ("referenceAccountId") REFERENCES "reference_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_briefings" ADD CONSTRAINT "daily_briefings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_briefings" ADD CONSTRAINT "daily_briefings_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "weekly_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_gates" ADD CONSTRAINT "image_gates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_issues" ADD CONSTRAINT "newsletter_issues_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "newsletter_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_deals" ADD CONSTRAINT "sponsor_deals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborations" ADD CONSTRAINT "collaborations_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
