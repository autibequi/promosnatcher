package scheduler

import (
	"context"
	"log/slog"
	"snatcher/backendv2/internal/pipeline"
	"time"

	"github.com/go-co-op/gocron/v2"
)

type Scheduler struct {
	s        gocron.Scheduler
	runner   *pipeline.Runner
	tgPoller func(ctx context.Context)
	interval int
}

type Status struct {
	Running         bool      `json:"running"`
	IntervalMinutes int       `json:"interval_minutes"`
	NextRun         time.Time `json:"next_run"`
}

func New(intervalMinutes int, runner *pipeline.Runner, tgPoller func(ctx context.Context)) (*Scheduler, error) {
	s, err := gocron.NewScheduler(gocron.WithStopTimeout(30 * time.Second))
	if err != nil {
		return nil, err
	}
	return &Scheduler{s: s, runner: runner, tgPoller: tgPoller, interval: intervalMinutes}, nil
}

func (sc *Scheduler) Start(ctx context.Context) error {
	_, err := sc.s.NewJob(
		gocron.DurationJob(time.Duration(sc.interval)*time.Minute),
		gocron.NewTask(func() {
			slog.Info("scheduler: run pipeline")
			if err := sc.runner.Run(ctx); err != nil {
				slog.Error("scheduler: pipeline error", "err", err)
			}
		}),
		gocron.WithSingletonMode(gocron.LimitModeReschedule),
	)
	if err != nil {
		return err
	}

	if sc.tgPoller != nil {
		_, err = sc.s.NewJob(
			gocron.DurationJob(30*time.Second),
			gocron.NewTask(func() { sc.tgPoller(ctx) }),
			gocron.WithSingletonMode(gocron.LimitModeReschedule),
		)
		if err != nil {
			return err
		}
	}

	sc.s.Start()
	return nil
}

func (sc *Scheduler) Stop() {
	_ = sc.s.Shutdown()
}

func (sc *Scheduler) Status() Status {
	jobs := sc.s.Jobs()
	var nextRun time.Time
	if len(jobs) > 0 {
		nextRun, _ = jobs[0].NextRun()
	}
	return Status{
		Running:         len(jobs) > 0,
		IntervalMinutes: sc.interval,
		NextRun:         nextRun,
	}
}
