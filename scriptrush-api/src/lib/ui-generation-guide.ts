/** API patterns for the writer, not a fallback script or a fixed visual design. */
export const UI_GENERATION_GUIDE = `Roblox UI correctness reference. Adapt these primitives to the requested design; they do not define a palette, title, size or feature set.
- Create every UI instance with Instance.new("ClassName"); UICorner.new does not exist. For rounded panels parent a UICorner to that panel and set CornerRadius = UDim.new(0, radius).
- Signals belong to instances: button.Activated:Connect(handler), not button:Connect(handler). A helper taking an instance and event name must use object[eventName]:Connect(handler). Destroy() is a method; Destroying is the event.
- Declare local variables BEFORE any function that captures them, and define local functions BEFORE calling them. If forward references are necessary, predeclare the local first and assign it later. A function defined before local panel captures a different global panel. Likewise, predeclare a local tabButton before assigning a factory callback that refers to tabButton.
- Position the tab bar BELOW the header and the content BELOW the tab bar. Give each tab button its own horizontal position or use UIListLayout. Use UIListLayout with distinct LayoutOrder for multiple form rows, or distinct Y positions; never place every row at the same coordinates. Child positions and sizes are relative to their own parent, not copied from that parent's coordinates.
- Keep palette Color3 values separate from boolean toggle arguments. Apply the selected palette to actual panel/control/text properties, including active navigation; assigning a boolean to BackgroundColor3 is invalid.
- Roblox buttons have no Disable()/Enable() methods. Use Interactable=false/true. Keyboard Escape is input.KeyCode == Enum.KeyCode.Escape, not Enum.UserInputType.Escape. TeleportService has no TeleportEnded event; do not add invented lifecycle listeners.
- Minimize hides the main panel and shows a small restore button outside it. Restore reverses both. Close disconnects owned connections AND destroys the entire owned ScreenGui, including the restore button.
- Store every owned event connection through one helper. Valid connection/drag pattern (use the actual variable names in the full script):
local connections = {}
local function own(signal, handler)
    local connection = signal:Connect(handler)
    table.insert(connections, connection)
    return connection
end
local function makeDraggable(frame, handle)
    handle.Active = true
    local dragging, startPointer, startPosition
    own(handle.InputBegan, function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true
            startPointer = input.Position
            startPosition = frame.Position
        end
    end)
    own(UserInputService.InputChanged, function(input)
        if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            local delta = input.Position - startPointer
            frame.Position = UDim2.new(startPosition.X.Scale, startPosition.X.Offset + delta.X, startPosition.Y.Scale, startPosition.Y.Offset + delta.Y)
        end
    end)
    own(UserInputService.InputEnded, function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then dragging = false end
    end)
end
MouseButton1 and MouseMovement are DIFFERENT InputObjects: never compare the movement input with the press input by identity. Base the new Position on startPosition, not on the already-moved frame.Position. Use own for buttons, navigation, dragging and respawn callbacks too. Before returning, inspect for syntax errors, overlapping controls and all requested rounded corners.`;
