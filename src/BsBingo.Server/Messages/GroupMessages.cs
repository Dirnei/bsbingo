namespace BsBingo.Server.Messages;

public sealed record GetAllGroups(string? UserId = null);

public sealed record GetGroupById(string Id);

public sealed record CreateGroup(string Name, string? Description, List<string> Words, string? UserId, string Visibility = "public");

public sealed record UpdateGroup(string Id, string Name, string? Description, List<string> Words, string? UserId, string Visibility = "public");

public sealed record DeleteGroup(string Id, string? UserId);

public sealed record GenerateInviteLink(string GroupId, string UserId);

public sealed record AcceptInvite(string Token, string UserId);

public sealed record GetGroupByInviteToken(string Token);

public sealed record GetMyGroups(string UserId);

public sealed record GetSharedUsers(string GroupId, string UserId);

public sealed record GroupResult(bool Success, string? Error = null, object? Data = null);
