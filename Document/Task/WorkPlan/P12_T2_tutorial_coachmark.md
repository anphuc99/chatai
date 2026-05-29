# P12.T2 — TutorialStore + Coachmark Component (Client)

## 1. METADATA

| Field | Value |
|-------|-------|
| Task ID | P12.T2 |
| Phase | 12 |
| Depends on | P12.T1 |
| Complexity | Medium |
| Risk | Medium (overlay positioning on RN) |

---

## 2. MỤC TIÊU & SCOPE

**In-scope**:
- `TutorialStore` (Zustand) sync với server `/tutorial/state`.
- Listener for `TUTORIAL_ADVANCED` SSE event (optional — fallback to refetch on screen focus).
- `CoachmarkOverlay` full-screen component:
  - Reads `currentStep` + finds target via `nativeID` measurement.
  - Renders spotlight (hole) + tooltip + buttons (Tiếp / Bỏ qua).
- `TutorialWelcomeOverlay` for step 0 (no target, full modal).
- `steps.ts` config.
- Skip flow: confirm Alert → `tutorialService.skip()` → store updates → overlay unmounts.

---

## 3. FILES CẦN TẠO

| # | Path |
|---|------|
| 1 | `apps/mobile/src/features/tutorial/store/tutorial.store.ts` |
| 2 | `apps/mobile/src/features/tutorial/services/tutorial.service.ts` |
| 3 | `apps/mobile/src/features/tutorial/config/steps.ts` |
| 4 | `apps/mobile/src/features/tutorial/components/CoachmarkOverlay.tsx` |
| 5 | `apps/mobile/src/features/tutorial/components/CoachmarkTooltip.tsx` |
| 6 | `apps/mobile/src/features/tutorial/components/TutorialWelcomeOverlay.tsx` |
| 7 | `apps/mobile/src/features/tutorial/hooks/useCoachmarkTarget.ts` |

Cài thêm: `react-native-walkthrough-tooltip` hoặc tự build với `Modal` + masked overlay.

---

## 4. CLASS / STATE DIAGRAM

```mermaid
classDiagram
    class TutorialStore {
        +currentStep number
        +loading bool
        +fetchState() Promise
        +setStep(n) void
        +advance() Promise   "step 0 → 1"
        +skip() Promise
        +isActive bool        "step < 7"
    }
    class CoachmarkOverlay {
        renders if isActive && step has target
        finds target by nativeID
        renders spotlight + tooltip
    }
    class TutorialWelcomeOverlay {
        renders if step===0
    }
    class useCoachmarkTarget {
        (nativeID) → measures & returns rect
    }
    
    CoachmarkOverlay --> useCoachmarkTarget
    CoachmarkOverlay --> TutorialStore
```

---

## 5. CHI TIẾT

### 5.1. `steps.ts`

```ts
export type TutorialStepConfig = {
  step: number
  targetId: string | null
  title: string
  message: string
  placement?: 'top'|'bottom'|'left'|'right'
}

export const TUTORIAL_STEPS_CONFIG: TutorialStepConfig[] = [
  { step: 0, targetId: null, title: 'Chào mừng!', message: 'Ứng dụng giúp bạn học tiếng Trung qua roleplay chat...' },
  { step: 1, targetId: 'story-create-button', title: 'Tạo câu chuyện', message: 'Nhấn nút + để tạo câu chuyện đầu tiên.', placement: 'top' },
  { step: 2, targetId: 'character-create-button', title: 'Tạo nhân vật', message: 'Thêm nhân vật cho câu chuyện.', placement: 'top' },
  { step: 3, targetId: 'start-chat-button', title: 'Bắt đầu chat', message: 'Nhấn để bắt đầu phiên roleplay.', placement: 'top' },
  { step: 4, targetId: 'chat-input-bar', title: 'Gửi tin nhắn', message: 'Gõ tiếng Trung hoặc Việt.', placement: 'top' },
  { step: 5, targetId: 'word-save-button', title: 'Lưu từ vựng', message: 'Tap chữ Hán và nhấn Lưu.', placement: 'top' },
  { step: 6, targetId: 'end-chat-button', title: 'Kết thúc chat', message: 'Nhấn để lưu lại phiên.', placement: 'bottom' },
]
```

### 5.2. `tutorialService.ts`

```
getState(): /tutorial/state → { step, isComplete, totalSteps }
skip(): POST /tutorial/skip
advance(targetStep): POST /tutorial/advance { targetStep }
```

### 5.3. Store

```
state: { currentStep: 7, loading: false }

fetchState():
  set({loading:true})
  try {
    const s = await tutorialService.getState()
    set({currentStep: s.step})
  } finally set({loading:false})

setStep(n): set({currentStep: n})

advance():
  // Used for explicit user "Tiếp" tap from step 0 → 1
  const next = get().currentStep + 1
  await tutorialService.advance(next)
  set({currentStep: next})

skip():
  Alert.confirm('Bỏ qua hướng dẫn?', async () => {
    await tutorialService.skip()
    set({currentStep: 7})
  })

isActive: () => get().currentStep < 7
```

### 5.4. `useCoachmarkTarget(nativeID)`

```
function useCoachmarkTarget(nativeID): Rect | null {
  const [rect, setRect] = useState(null)
  
  useEffect(() => {
    if (!nativeID) { setRect(null); return }
    const interval = setInterval(() => {
      // Find node by nativeID via UIManager / findNodeHandle
      const node = findNodeByNativeID(nativeID)
      if (node) {
        node.measureInWindow((x,y,w,h) => {
          if (rect?.x !== x || rect?.y !== y) setRect({x,y,width:w,height:h})
        })
      } else setRect(null)
    }, 300)
    return () => clearInterval(interval)
  }, [nativeID])
  
  return rect
}
```

(Note: `findNodeByNativeID` may need a manual registry — store refs in a `TargetRegistry` exposed via `useTutorialTarget(nativeID)` hook that consumers wrap their component with.)

### 5.5. `TargetRegistry` pattern (preferred over nativeID lookup)

```
// targetRegistry.ts
const targets = new Map<string, View>()

export function registerTarget(id: string, ref: View): () => void {
  targets.set(id, ref)
  return () => targets.delete(id)
}

export function getTargetRect(id: string): Promise<Rect|null> {
  const ref = targets.get(id)
  if (!ref) return null
  return new Promise(res => ref.measureInWindow((x,y,w,h) => res({x,y,width:w,height:h})))
}

// useTutorialTarget hook
function useTutorialTarget(id: string) {
  const ref = useRef<View>(null)
  useEffect(() => {
    if (ref.current) return registerTarget(id, ref.current)
  }, [id])
  return ref
}
```

Consumer:
```
const ref = useTutorialTarget('story-create-button')
<Pressable ref={ref} onPress={...} />
```

### 5.6. `CoachmarkOverlay`

```
function CoachmarkOverlay() {
  const { currentStep } = useTutorialStore()
  const config = TUTORIAL_STEPS_CONFIG.find(c => c.step === currentStep)
  
  if (!config || currentStep === 0) return null  // welcome handled separately
  
  const rect = useCoachmarkTargetRect(config.targetId)
  if (!rect) return null   // target not mounted yet
  
  return (
    <Modal transparent visible animationType="fade">
      <View style={overlayBlack}>
        <SpotlightHole rect={rect} padding={8} />
        <CoachmarkTooltip
          rect={rect}
          placement={config.placement}
          title={config.title}
          message={config.message}
          onSkip={() => useTutorialStore.getState().skip()}
        />
      </View>
    </Modal>
  )
}
```

`SpotlightHole`: use `react-native-svg` Mask or `MaskedView` to cut hole.

### 5.7. `CoachmarkTooltip`

```
Render: positioned near rect (above/below) with arrow.
Content:
  <Title>{title}</Title>
  <Body>{message}</Body>
  <Row>
    <SkipButton onPress={onSkip}>Bỏ qua</SkipButton>
  </Row>
```

No "Tiếp" button for action-based steps — they auto-advance when user does the action.

### 5.8. `TutorialWelcomeOverlay`

```
function TutorialWelcomeOverlay() {
  const { currentStep, advance, skip } = useTutorialStore()
  if (currentStep !== 0) return null
  return (
    <Modal transparent visible>
      <Center>
        <Card>
          <BigTitle>Chào mừng!</BigTitle>
          <Body>...intro text...</Body>
          <PrimaryButton onPress={advance}>Tiếp</PrimaryButton>
          <SkipButton onPress={skip}>Bỏ qua</SkipButton>
        </Card>
      </Center>
    </Modal>
  )
}
```

---

## 6. SEQUENCE

```mermaid
sequenceDiagram
    participant U as User
    participant App
    participant Store
    participant API
    participant Reg as TargetRegistry
    participant Ov as Overlay

    App->>Store: fetchState (on login)
    Store->>API: GET /tutorial/state
    API-->>Store: { step:1 }
    
    Note over App: Render StoryList; FAB registers target
    Ov->>Reg: getTargetRect('story-create-button')
    Reg-->>Ov: rect
    Ov->>U: render spotlight + tooltip
    
    U->>App: tap FAB → create story
    App->>API: POST /stories
    API-->>App: created
    Note over API: server emits STORY_CREATED → TutorialListener advances to 2
    
    App->>Store: fetchState() (on screen focus or via SSE TUTORIAL_ADVANCED)
    Store-->>Ov: step=2 → re-render with new target
```

---

## 7. ACCEPTANCE & TEST PLAN

- [ ] Step 0 → Welcome modal hiện.
- [ ] Step 1 → spotlight trên story FAB.
- [ ] Tạo story → step=2 (sau fetchState/SSE) → spotlight chuyển.
- [ ] Skip → confirm → step=7 → overlay gone.
- [ ] Reopen app → step persist (via server).
- [ ] Target không mounted (sai screen) → không render overlay; auto hiện khi navigate đúng.
- [ ] Layout responsive: spotlight đúng vị trí after rotation/keyboard.
