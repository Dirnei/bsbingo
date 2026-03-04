namespace BsBingo.Server.Messages;

public sealed record NewGame(string GroupId);

public sealed record Board(List<BoardCell> Cells);

public sealed record BoardCell(int Index, string Text, bool IsFreeSpace);
