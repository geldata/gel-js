module default {
    type GameSession {
        multi link players: User {
            constraint exclusive;
        }
        required property num: int32;
    }

    abstract type Named {
        required property name: str;
    }

    type Post {
        required link author: User;
        required property body: str;
    }

    type User extending Named;

    type UserGroup extending Named {
        multi link users: User;
    }

    type AssortedScalars {
        required name: str;
        vals: array<str>;
        ts: datetime;
        bstr: bytes;
    }
}
