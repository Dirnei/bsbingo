using Akka.Actor;
using BsBingo.Server.Messages;
using BsBingo.Server.Services;

namespace BsBingo.Server.Actors;

public sealed class GroupActor : ReceiveActor
{
    public GroupActor(GroupRepository repository)
    {
        ReceiveAsync<GetAllGroups>(async _ =>
        {
            var groups = await repository.GetAllAsync();
            Sender.Tell(groups);
        });

        ReceiveAsync<GetGroupById>(async msg =>
        {
            var group = await repository.GetByIdAsync(msg.Id);
            Sender.Tell(group);
        });
    }
}
