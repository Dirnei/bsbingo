using Akka.Actor;
using BsBingo.Server.Messages;
using BsBingo.Server.Services;

namespace BsBingo.Server.Actors;

public sealed class GameActor : ReceiveActor
{
    private static readonly Random Rng = new();

    public GameActor(GroupRepository repository)
    {
        ReceiveAsync<NewGame>(async msg =>
        {
            var group = await repository.GetByIdAsync(msg.GroupId);
            if (group is null)
            {
                Sender.Tell(null);
                return;
            }

            var shuffled = group.Words.OrderBy(_ => Rng.Next()).ToList();
            var selected = shuffled.Take(24).ToList();

            var cells = new List<BoardCell>(25);
            var wordIndex = 0;
            for (var i = 0; i < 25; i++)
            {
                if (i == 12)
                {
                    cells.Add(new BoardCell(i, "FREE\n☕", true));
                }
                else
                {
                    cells.Add(new BoardCell(i, selected[wordIndex++], false));
                }
            }

            Sender.Tell(new Board(cells));
        });
    }
}
