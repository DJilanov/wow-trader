package core

// Test-only agent from upstream dot_test.go at 9a27c3d6af91d1ca0dbcf94a124b8869ad522108.
// The parent retained a core regression but omitted this fixture; no factories are registered here.
type FakeAgent struct {
	Spell *Spell
	Dot   *Dot
	Character
	Init func()
}

func (fa *FakeAgent) GetCharacter() *Character { return &fa.Character }
func (fa *FakeAgent) Initialize() {
	if fa.Init != nil {
		fa.Init()
	}
}
func (fa *FakeAgent) ApplyTalents()            {}
func (fa *FakeAgent) Reset(_ *Simulation)      {}
func (fa *FakeAgent) OnGCDReady(_ *Simulation) {}

var _ Agent = (*FakeAgent)(nil)
