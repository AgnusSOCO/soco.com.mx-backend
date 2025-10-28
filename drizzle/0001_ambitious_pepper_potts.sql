CREATE TABLE `analytics_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`eventType` varchar(50) NOT NULL,
	`eventName` varchar(100),
	`elementId` varchar(100),
	`elementClass` text,
	`elementText` text,
	`path` text NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analytics_heatmap` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`path` text NOT NULL,
	`eventType` varchar(20) NOT NULL,
	`x` int,
	`y` int,
	`scrollDepth` int,
	`viewportWidth` int,
	`viewportHeight` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_heatmap_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analytics_pageviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`path` text NOT NULL,
	`title` text,
	`referrer` text,
	`duration` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_pageviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analytics_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`userId` int,
	`userAgent` text,
	`ipAddress` varchar(45),
	`country` varchar(2),
	`city` varchar(100),
	`device` varchar(50),
	`browser` varchar(50),
	`os` varchar(50),
	`referrer` text,
	`landingPage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastActivity` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `analytics_sessions_sessionId_unique` UNIQUE(`sessionId`)
);
