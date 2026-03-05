namespace BsBingo.Server.Messages;

public sealed record GetAllGroups;

public sealed record GetGroupById(string Id);

public sealed record CreateGroup(string Name, string? Description, List<string> Words, string? UserId);

public sealed record UpdateGroup(string Id, string Name, string? Description, List<string> Words, string? UserId);

public sealed record DeleteGroup(string Id, string? UserId);

public sealed record GroupResult(bool Success, string? Error = null, object? Data = null);
